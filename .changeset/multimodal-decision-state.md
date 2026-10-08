---
'ai': patch
'@ai-sdk/provider': patch
'@ai-sdk/provider-utils': patch
'@ai-sdk/openai': patch
'@ai-sdk/gateway': patch
'@ai-sdk/typesafe-ai': patch
'@ai-sdk/otel': patch
---

Add ordered text, file, and JSON parts to experimental decision state. Support image input in OpenAI Decisions and language model adapters. Gateway retains its existing string and JSON request format and rejects files, as does TypeSafe AI.

Arrays passed directly as state now contain decision state parts. Wrap JSON arrays in an object or a json part.

Normalize all public state forms into an array of parts before calling decision providers. Providers receive text and JSON objects as text and json parts.

Serialize decision file bytes as base64 in OpenTelemetry state attributes. Model-call spans record normalized state parts, while outer spans retain public state inputs.

Preserve native JSON state in TypeSafe AI when state contains one JSON part. Label shared state in language-model decision prompts.
