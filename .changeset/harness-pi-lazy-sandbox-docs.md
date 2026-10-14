---
'@ai-sdk/harness-pi': patch
---

docs(harness-pi): run chat-only turns without a sandbox

The Pi documentation now explains that Pi makes no sandbox call for a turn that has no skills and calls no file or `bash` tool, so with `createLazyNetworkSandboxSession()` such turns run without creating or resuming a sandbox.
