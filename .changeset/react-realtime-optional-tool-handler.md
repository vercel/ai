---
'@ai-sdk/react': patch
---

Preserve missing-tool-handler diagnostics in `experimental_useRealtime` by leaving an omitted `onToolCall` undefined. Publish handler presence only at commit without reconnecting or exposing handlers from abandoned renders. A defined handler returning undefined continues to support manual tool output.
