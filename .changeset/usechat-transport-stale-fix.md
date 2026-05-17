---
"@ai-sdk/react": patch
---

fix(react): refresh transport across renders in `useChat`

`useChat` previously captured the `transport` (and any `body` / `headers` / `prepareSendMessagesRequest` baked into it) on the very first render, so inline transports closing over component state would forever send the first-render value. Apply the same pattern already used for `onFinish` / `onError` / `onToolCall`: keep the user's transport in a ref, and pass `Chat` a stable delegating proxy that reads the latest transport on every `sendMessages` / `reconnectToStream` call.

Closes #7819.
