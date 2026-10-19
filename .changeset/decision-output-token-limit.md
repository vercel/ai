---
"ai": patch
"@ai-sdk/provider": patch
"@ai-sdk/provider-utils": patch
"@ai-sdk/openai": patch
"@ai-sdk/typesafe-ai": patch
"@ai-sdk/perplexity": patch
"@ai-sdk/gateway": patch
---

Add `maxOutputTokens` and `reasoning` to experimental decision calls and forward them to language-model-backed decisions. Language-model adapters keep reasoning disabled when omitted. Native decision providers warn when either setting is unsupported.
