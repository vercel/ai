---
'@ai-sdk/google': patch
'@ai-sdk/google-vertex': patch
---

Download Google Vertex tool result files with the `fetch` passed to `createVertex` instead of the runtime's global fetch, and limit each download to `toolResultDownloads.maxBytes`.

Two behavior changes come with this. The default maximum size for a single tool result file download is now 7 MiB instead of 2 GiB; raise `toolResultDownloads.maxBytes` for larger files. And on Node.js, a configured `fetch` now replaces the built-in download transport, which validates and pins DNS results at connect time. If that `fetch` is a wrapper for logging or tracing while tool result URLs are untrusted, it needs equivalent connect-time DNS validation, or constrain egress at the network layer.
