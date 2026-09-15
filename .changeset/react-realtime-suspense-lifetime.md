---
'ai': patch
'@ai-sdk/react': patch
---

Preserve realtime connections and owned media when Suspense hides an already-committed conversation. Silently retire the specific replaced or unmounted store in insertion cleanup, defer resource disposal to passive cleanup, fence retained controls after hidden unmounts, and preserve StrictMode reconnection from child layout effects.

Provide protected, non-notifying attempt retirement for commit-phase cleanup, fencing codec, capture, playback, and application callbacks while retaining resources for later disposal and abort.
