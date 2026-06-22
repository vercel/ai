---
'@ai-sdk/react': patch
---

fix(@ai-sdk/react): re-render `useChat` when remounting onto an already-streaming chat. A component that mounts onto a `Chat` instance that is mid-stream (`submitted`/`streaming`) now receives an immediate messages notification on subscribe, so React re-reads the snapshot and keeps rendering streamed chunks without needing an unrelated re-render trigger.
