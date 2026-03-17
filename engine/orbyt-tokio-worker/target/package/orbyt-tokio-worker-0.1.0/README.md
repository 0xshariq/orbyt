# Orbyt Tokio Worker

Tokio-based sidecar worker used by Orbyt JobScheduler when `workerBackend` is set to `tokio`.

## Protocol

Input (one JSON message per line):

- `{ "type": "execute", "job": { "id": "...", "workflowId": "...", "payload": {}, "metadata": {} } }`
- `{ "type": "ping" }`
- `{ "type": "shutdown" }`

Output (one JSON message per line):

- `{ "type": "ready" }`
- `{ "type": "progress", "progress": { ... } }`
- `{ "type": "completed", "result": { ... } }`
- `{ "type": "failed", "error": "..." }`

## Local Run

From engine package root:

```bash
pnpm run tokio-worker:run
```

## Engine Config

```ts
const engine = new OrbytEngine({
  scheduler: {
    job: {
      workerBackend: 'tokio',
      tokioWorkerCommand: 'cargo',
      tokioWorkerArgs: ['run', '--quiet', '--manifest-path', 'rust/orbyt-tokio-worker/Cargo.toml']
    }
  }
});
```

When command is left as default (`orbyt-tokio-worker`), JobScheduler also tries a local fallback to:

- `cargo run --quiet --manifest-path <cwd>/rust/orbyt-tokio-worker/Cargo.toml`
