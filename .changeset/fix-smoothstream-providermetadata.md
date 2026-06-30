---
'ai': patch
---

Fix `smoothStream` dropping `providerMetadata` from chunks emitted by its chunking loop. Previously only the final flushed chunk retained `providerMetadata` (e.g. Anthropic extended-thinking signatures), so metadata on intermediate `text-delta`/`reasoning-delta` parts was silently lost. The loop now carries `providerMetadata`, emitted once (mirroring the flush path).
