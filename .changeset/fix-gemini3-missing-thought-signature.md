---
'@ai-sdk/google': patch
---

fix(google): auto-inject `skip_thought_signature_validator` for Gemini 3 tool-call replays without a signature

Gemini 3 models reject requests when an assistant `functionCall` part lacks a `thoughtSignature` with HTTP 400 `"Function call is missing a thought_signature in functionCall parts."` This is easy to hit when application code persists/serializes messages and drops `providerOptions.google.thoughtSignature` (custom DB schemas, `useChat` server routes that rebuild messages, synthetic tool-call injection).

The provider now detects this case (Gemini 3 model + missing signature under `google`, `googleVertex`, and `vertex` namespaces) and injects the documented `skip_thought_signature_validator` sentinel into the outbound `functionCall`, plus surfaces a one-shot warning per request listing the affected tool names so the developer can find and fix the upstream serialization. Non-Gemini-3 models are unaffected, and real signatures take precedence when present.
