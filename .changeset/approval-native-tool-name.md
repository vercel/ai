---
'@ai-sdk/harness': patch
---

Name the runtime's own tool on built-in tool approval requests. The request carried only the harness's tool name (`bash`) while its input had the runtime's shape (`command`), so a host checking calls by the runtime's names (`Bash`) could not match it. The native name is now in `toolCall.providerMetadata[harnessId].nativeToolName`.
