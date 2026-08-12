---
'@ai-sdk/gateway': minor
---

feat(gateway): opt-in CBOR request encoding for language-model file uploads

Adds an `encoding` provider setting (`'json'` default, `'cbor'` opt-in). When
enabled and a prompt contains inline `Uint8Array` file data (file,
reasoning-file, or tool-result file parts), the request body is sent as
`application/cbor` with bytes intact instead of base64-in-JSON (~25% smaller
uploads, no client-side base64 encode). Requests without inline file bytes are
always sent as JSON. On HTTP 415 the client retries once as JSON and stops
sending CBOR for the life of the instance. Requires a gateway deployment that
accepts CBOR request bodies.

CBOR is implemented by a small vendored RFC 8949 encoder/decoder
(`src/cbor.ts`, definite lengths, no tags, JSON parity for `toJSON` and
`undefined`) rather than an external dependency.
