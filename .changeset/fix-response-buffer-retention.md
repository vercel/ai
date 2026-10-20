---
"@ai-sdk/provider-utils": patch
---

Avoid retaining oversized backing buffers when reading response bodies, reducing memory usage for responses delivered in small chunks on runtimes such as Deno.
