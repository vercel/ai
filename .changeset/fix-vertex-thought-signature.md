---
'@ai-sdk/google': patch
---

fix(google): use dynamic providerOptionsName when retrieving thoughtSignature in convertToGoogleGenerativeAIMessages

When using @ai-sdk/google-vertex provider with Gemini thinking models, multi-step tool calls would fail with "function call is missing a thought_signature" error. This was because thoughtSignature was stored under providerOptions.vertex but retrieved using hardcoded providerOptions.google. This fix passes providerOptionsName to convertToGoogleGenerativeAIMessages and uses it dynamically.
