---
'@ai-sdk/google-vertex': patch
---

Keep Google Vertex tool result downloads on the DNS-pinned default transport unless `toolResultDownloads.fetch` is set.

The previous release forwarded the provider `fetch` option to tool result downloads. Ordinary logging, tracing, or proxy wrappers passed there then replaced the built-in Node.js transport that validates and pins DNS results, so tool result URLs with hostnames resolving to private addresses could reach internal hosts. Tool result downloads now ignore the provider `fetch` option and keep the validated default transport. To use another transport for those downloads, set `toolResultDownloads.fetch`; it must perform equivalent connect-time DNS validation, for example a guarded fetch on Bun or Deno.
