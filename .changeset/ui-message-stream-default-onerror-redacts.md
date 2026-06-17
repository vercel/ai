---
'ai': patch
---

fix: redact server error details from UI message streams by default

`toUIMessageStream`, `createUIMessageStream`, and `toUIMessageChunk` defaulted their `onError` callback to `getErrorMessage`, which serializes the raw error (`error.toString()` / `JSON.stringify(error)`) into the client-facing `{ type: 'error', errorText }` chunk — and also into `tool-output-error` parts. The documented default was `() => 'An error occurred.'`, so applications relying on the documented behavior were unknowingly streaming server exception details (internal hostnames, paths, provider request data, validation inputs) to end users.

The default `onError` now returns the documented generic `'An error occurred.'`. Raw error details are only emitted when the developer explicitly supplies an `onError` handler. This also redacts `tool-output-error` and invalid-tool-input error text by default; pass an `onError` to surface richer messages.
