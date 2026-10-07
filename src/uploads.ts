/**
 * Copyright (c) 2026 MockMarlin
 *
 * SPDX-License-Identifier: MIT
 */

import { parseUploadGrant, parseUploadResult, type UploadResult } from "@mockmarlin/saas-contract";

import { readJson, type SaasClient } from "./client.js";

export async function uploadFile(
  client: SaasClient,
  preparePath: string,
  completePath: string,
  file: Blob,
  fileName: string,
  onProgress?: (loaded: number, total: number) => void,
): Promise<UploadResult> {
  const grant = await readJson(
    await client.fetch(preparePath, {
      method: "POST",
      body: JSON.stringify({ fileName, mimeType: file.type || "application/octet-stream", sizeBytes: file.size }),
      idempotencyKey: `upload_${fileName}_${file.size}`,
    }),
    parseUploadGrant,
  );
  await sendFile(grant.url, grant.method, grant.headers, file, onProgress);
  return readJson(
    await client.fetch(completePath, {
      method: "POST",
      body: JSON.stringify({ key: grant.key }),
      idempotencyKey: `upload_complete_${grant.key}`,
    }),
    parseUploadResult,
  );
}

function sendFile(
  url: string,
  method: string,
  headers: Record<string, string>,
  file: Blob,
  onProgress?: (loaded: number, total: number) => void,
): Promise<void> {
  if (onProgress === undefined || typeof XMLHttpRequest === "undefined") {
    return fetch(url, { method, headers, body: file }).then((response) => {
      if (!response.ok) {
        throw new Error("Upload failed");
      }
    });
  }
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(method, url);
    for (const [name, value] of Object.entries(headers)) {
      xhr.setRequestHeader(name, value);
    }
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress(event.loaded, event.total);
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
        return;
      }
      reject(new Error("Upload failed"));
    };
    xhr.onerror = () => reject(new Error("Upload failed"));
    xhr.send(file);
  });
}
