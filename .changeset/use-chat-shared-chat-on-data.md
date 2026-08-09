---
'ai': patch
'@ai-sdk/react': patch
---

fix(react): call the `useChat` `onData` callback when a shared `Chat` instance is supplied

Previously, passing an existing `chat` instance to `useChat` caused the hook-level `onData` callback to be ignored, even though the `Chat` instance's own `onData` fired. `AbstractChat` now supports registering additional data callbacks, and `useChat` registers its `onData` alongside the chat-level one so every hook sharing a `Chat` observes data parts (including transient ones). Fixes #8597.
