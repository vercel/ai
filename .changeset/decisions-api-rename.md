---
'ai': patch
'@ai-sdk/provider': patch
'@ai-sdk/provider-utils': patch
'@ai-sdk/gateway': patch
'@ai-sdk/typesafe-ai': patch
'@ai-sdk/openai': patch
'@ai-sdk/anthropic': patch
'@ai-sdk/google': patch
'@ai-sdk/otel': patch
---

Rename `experimental_evaluate` to `experimental_decide` and use decision terminology for its models and results. Use `experimental_decide`, `decisionModel`, `decisionModels`, and the `Experimental_Decision*` types in place of their evaluation counterparts. Model implementations now use `doDecide`, and telemetry uses decide callbacks and operation names. The provider-utils adapter entry point is now `@ai-sdk/provider-utils/experimental-decision`.

Gateway and TypeSafe request and response formats remain unchanged.
