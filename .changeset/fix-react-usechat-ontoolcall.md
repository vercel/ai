---
'@ai-sdk/react': patch
---

Fix: ensure `useChat` uses the latest `onToolCall` (and other callbacks) to avoid stale closures.

Changes:

- Update `useChat` to use intermediary proxy callbacks that forward to refs, ensuring the latest callbacks are always used without recreating the chat instance.
- Add a regression test verifying the latest `onToolCall` is invoked after a prop change.

Related to: https://github.com/vercel/ai/issues/8148
