# Setup

Wrap the tree in `kit.Provider`. The provider loads the session once and starts the idle timer. `renderIdle` receives a `resume` function. Calling it leaves idle mode and runs `presence.onLive`.

`paths` is the same object you pass to the Fastify plugin. `origin` is empty when the API is on the same origin.
