---
'ai': patch
'@ai-sdk/provider': patch
'@ai-sdk/provider-utils': patch
'@ai-sdk/openai': patch
'@ai-sdk/gateway': patch
'@ai-sdk/typesafe-ai': patch
---

Add ordered text, file, and JSON parts to experimental decision state. Support image input in OpenAI Decisions and language model adapters, and encode file bytes for Gateway. Reject files in the text-only TypeSafe AI provider.

Arrays passed directly as state now contain decision state parts. Wrap JSON arrays in an object or a json part.

Normalize all public state forms into an array of parts before calling decision providers. Providers receive text and JSON objects as text and json parts.

Move public decision question inputs into Core and normalize JSON instructions and criteria descriptions to strings before provider calls. Remove the provider input type; provider questions now accept string instructions and string or null descriptions. Preserve literal Choice option inference.
