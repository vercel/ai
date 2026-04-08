---
'@ai-sdk/workflow': patch
---

fix(workflow): preserve provider tool identity across step boundaries

Provider tools (like `anthropic.tools.webSearch`) now retain their `type`, `id`, and `args` when serialized across workflow step boundaries. Previously, `serializeToolSet` converted all tools into plain function tools, causing the Gateway to not recognize them as provider-executed tools.
