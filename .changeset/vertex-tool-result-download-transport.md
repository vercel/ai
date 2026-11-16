---
'@ai-sdk/google-vertex': patch
---

Keep Google Vertex tool result downloads on the built-in validated transport and stop using the provider `fetch` option for them. Set `toolResultDownloads.fetch` to choose another transport for those downloads.

The built-in transport resolves every hostname through a validating lookup hook and pins the connection to the resolved address on Node.js. Reusing the provider `fetch` option for downloads would adopt a logging, tracing, or proxy wrapper that does not validate DNS results, so tool result URLs whose hostnames resolve to private addresses could reach internal hosts. A transport set with `toolResultDownloads.fetch` must perform equivalent connect-time DNS validation, for example a guarded fetch on Bun or Deno.
