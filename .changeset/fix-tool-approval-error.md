---
'ai': patch
---

Fix "no tool invocation found" error in tool approval flow. Changed `getToolInvocation()` to return `undefined` instead of throwing when tool invocations aren't found after message resubmission, allowing approval flow to work correctly.