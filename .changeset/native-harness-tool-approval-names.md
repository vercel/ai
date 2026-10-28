---
'@ai-sdk/harness': patch
---

Preserve differing runtime-native tool names in `providerMetadata[harnessId].nativeToolName` on tool calls and their approval requests, so approval gates can identify built-in tools without changing harness tool names or runtime input shapes.
