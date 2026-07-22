---
'@ai-sdk/provider-utils': patch
'ai': patch
'@ai-sdk/harness': patch
---

feat: thread the tool-approval decision (`approvalId`, `approved`, `reason`) into tool execution as `options.approval`, so approved tools can act on data attached to the approval — mirroring how denials already deliver their reason via `execution-denied`
