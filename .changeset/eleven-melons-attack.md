---
'@ai-sdk/react': patch
---

fix (react): throttle the `useChat` messages snapshot to prevent "Maximum update depth exceeded" during streaming

`throttle`/`experimental_throttle` only throttled the subscribe callback, while `useSyncExternalStore`'s `getSnapshot` read `messages` directly and returned a fresh array on every stream chunk. Any re-render then read that un-throttled snapshot and re-rendered per chunk, which could exceed React's nested update limit on slower devices. The React chat state now publishes a separate throttled snapshot so both the notification and the snapshot are throttled together.
