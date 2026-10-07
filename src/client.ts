/**
 * Copyright (c) 2026 MockMarlin
 *
 * SPDX-License-Identifier: MIT
 */

import {
  IDEMPOTENCY_KEY_HEADER,
  REQUEST_ID_HEADER,
  SERVER_BUILD_HEADER,
  SaasError,
  headerValue,
  parseErrorEnvelope,
} from "@mockmarlin/saas-contract";

export class SaasIdleError extends Error {
  constructor() {
    super("The client is idle");
    this.name = "SaasIdleError";
  }
}

export interface SaasRequest {
  method?: string;
  body?: string | FormData;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  skipRefresh?: boolean;
  idempotencyKey?: string;
  timeoutMs?: number;
}

interface BufferedResponse {
  status: number;
  headers: [string, string][];
  body: string;
}

export interface SaasClientOptions {
  baseUrl: string;
  credentials?: RequestCredentials;
  timeoutMs?: number;
  refreshSession?: () => Promise<boolean>;
  onStaleClient?: (build: string) => void;
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
}

const IDEMPOTENT = new Set(["GET", "HEAD"]);

export class SaasClient {
  private readonly options: SaasClientOptions;
  private readonly inflight = new Map<string, Promise<BufferedResponse>>();
  private readonly active = new Set<AbortController>();
  private refresh: Promise<boolean> | null = null;
  private serverBuild: string | null = null;
  idle = false;

  constructor(options: SaasClientOptions) {
    this.options = options;
  }

  setIdle(idle: boolean): void {
    this.idle = idle;
    if (idle) {
      this.cancel();
    }
  }

  cancel(): void {
    for (const controller of this.active) {
      controller.abort();
    }
    this.active.clear();
  }

  url(path: string): string {
    if (path.startsWith("http://") || path.startsWith("https://")) {
      return path;
    }
    const base = this.options.baseUrl.replace(/\/$/, "");
    const relative = path.startsWith("/") ? path : `/${path}`;
    return `${base}${relative}`;
  }

  async fetch(path: string, request: SaasRequest = {}): Promise<Response> {
    if (this.idle) {
      throw new SaasIdleError();
    }
    const method = (request.method ?? "GET").toUpperCase();
    const buffered = await this.share(method, path, request);
    // 101, 204, 205, and 304 reject any body, including an empty string.
    const body = nullBodyStatus(buffered.status) ? null : buffered.body;
    return new Response(body, { status: buffered.status, headers: buffered.headers });
  }

  private share(method: string, path: string, request: SaasRequest): Promise<BufferedResponse> {
    if (!IDEMPOTENT.has(method) || (request.body !== undefined && typeof request.body !== "string")) {
      return this.perform(method, path, request, true);
    }
    const key = `${method} ${this.url(path)} ${request.body ?? ""}`;
    const existing = this.inflight.get(key);
    if (existing !== undefined) {
      return existing;
    }
    const created = this.perform(method, path, request, true).finally(() => {
      this.inflight.delete(key);
    });
    this.inflight.set(key, created);
    return created;
  }

  private async perform(method: string, path: string, request: SaasRequest, allowRefresh: boolean): Promise<BufferedResponse> {
    const idempotent = IDEMPOTENT.has(method);
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const buffered = await this.send(method, path, request);
      const retryable = idempotent && (buffered.status === 429 || buffered.status === 503) && attempt < 2;
      if (retryable) {
        await (this.options.sleep ?? delay)(retryDelay(buffered, attempt, this.options.random ?? Math.random));
        continue;
      }
      if (buffered.status === 401 && allowRefresh && request.skipRefresh !== true && this.options.refreshSession !== undefined) {
        const refreshed = await this.singleFlightRefresh();
        if (refreshed) {
          return this.perform(method, path, request, false);
        }
      }
      return buffered;
    }
    throw new SaasError(503, "unavailable", "The service stayed unavailable", "local");
  }

  private async send(method: string, path: string, request: SaasRequest): Promise<BufferedResponse> {
    if (this.idle) {
      throw new SaasIdleError();
    }
    const controller = new AbortController();
    this.active.add(controller);
    const timeout = setTimeout(() => controller.abort(), request.timeoutMs ?? this.options.timeoutMs ?? 15_000);
    const onAbort = (): void => controller.abort();
    request.signal?.addEventListener("abort", onAbort);
    const headers = new Headers(request.headers);
    if (!headers.has(REQUEST_ID_HEADER)) {
      headers.set(REQUEST_ID_HEADER, globalThis.crypto?.randomUUID?.() ?? `req_${Date.now()}`);
    }
    if (request.idempotencyKey !== undefined) {
      headers.set(IDEMPOTENCY_KEY_HEADER, request.idempotencyKey);
    }
    if (typeof request.body === "string" && !headers.has("content-type")) {
      headers.set("content-type", "application/json");
    }
    try {
      const fetchImpl = this.options.fetch ?? globalThis.fetch;
      const credentials = this.options.credentials;
      const response = await fetchImpl(this.url(path), {
        method,
        headers,
        signal: controller.signal,
        ...(request.body === undefined ? {} : { body: request.body }),
        ...(credentials === undefined ? {} : { credentials }),
      });
      this.noteBuild(response.headers.get(SERVER_BUILD_HEADER));
      const pairs: [string, string][] = [];
      response.headers.forEach((value, key) => {
        pairs.push([key, value]);
      });
      return { status: response.status, headers: pairs, body: await response.text() };
    } finally {
      clearTimeout(timeout);
      request.signal?.removeEventListener("abort", onAbort);
      this.active.delete(controller);
    }
  }

  private singleFlightRefresh(): Promise<boolean> {
    if (this.refresh === null) {
      const refreshSession = this.options.refreshSession;
      this.refresh = Promise.resolve(refreshSession === undefined ? false : refreshSession()).finally(() => {
        this.refresh = null;
      });
    }
    return this.refresh;
  }

  private noteBuild(value: string | null): void {
    if (value === null || value.length === 0) {
      return;
    }
    if (this.serverBuild !== null && this.serverBuild !== value) {
      this.options.onStaleClient?.(value);
    }
    this.serverBuild = value;
  }
}

function nullBodyStatus(status: number): boolean {
  return status === 101 || status === 204 || status === 205 || status === 304;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function retryDelay(response: BufferedResponse, attempt: number, random: () => number): number {
  const header = response.headers.find(([key]) => key.toLowerCase() === "retry-after");
  if (header !== undefined) {
    const seconds = Number(header[1]);
    if (Number.isFinite(seconds)) {
      return seconds * 1000;
    }
  }
  return 200 * 2 ** attempt + Math.floor(random() * 100);
}

export async function readJson<T>(response: Response, parse: (value: unknown) => T): Promise<T> {
  const text = await response.text();
  const body: unknown = text.length === 0 ? null : JSON.parse(text);
  if (!response.ok) {
    try {
      const envelope = parseErrorEnvelope(body);
      throw new SaasError(envelope.status, envelope.code, envelope.message, envelope.requestId);
    } catch (error: unknown) {
      if (error instanceof SaasError) {
        throw error;
      }
      throw new SaasError(response.status, "http_error", response.statusText || "Request failed", headerValue(response.headers.get(REQUEST_ID_HEADER) ?? undefined) ?? "local");
    }
  }
  return parse(body);
}
