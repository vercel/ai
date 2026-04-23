---
'@ai-sdk/mcp': patch
---

added `onNotification` option to `createMCPClient` so server-initiated notifications (e.g. `notifications/message` log events) are forwarded to the caller instead of silently dropped
