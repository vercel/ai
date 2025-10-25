---
'ai': patch
'@ai-sdk/react': patch
---

Fix: ensure `useChat` uses the latest `onToolCall` (and other callbacks) to avoid stale closures.

Changes:

- Add runtime setters to `AbstractChat` for `onToolCall`, `onData`, `onFinish`, `onError`, and `sendAutomaticallyWhen`.
- Update `useChat` to update these callbacks via setters on prop change, without recreating the chat instance.
- Add a regression test verifying the latest `onToolCall` is invoked after a prop change.

Related to: https://github.com/vercel/ai/issues/8148
