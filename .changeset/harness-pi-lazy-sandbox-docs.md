---
'@ai-sdk/harness-pi': patch
---

docs(harness-pi): run chat-only turns without a sandbox

The README now explains that Pi makes no sandbox call for a turn that has no skills and calls no file or `bash` tool, so `sandboxConfig.setup: 'lazy'` with `createLazyNetworkSandboxSession()` runs such turns without creating or resuming a sandbox.
