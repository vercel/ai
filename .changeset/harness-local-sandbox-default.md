---
'@ai-sdk/harness': patch
---

feat (harness): run on the local machine when no `sandbox` provider is given, so `HarnessAgent` works against the current working directory without configuring a hosted sandbox. This provides no isolation and warns once per process; suppress the warning with the `AI_SDK_LOG_WARNINGS` global.
