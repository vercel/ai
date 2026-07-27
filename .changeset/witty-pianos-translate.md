---
'@ai-sdk/openai': patch
'@ai-sdk/google': patch
'@ai-sdk/provider-utils': patch
---

feat: add experimental streaming speech translation models (`openai.translation('gpt-realtime-translate')` over the OpenAI Realtime translations WebSocket and `google.translation('gemini-3.5-live-translate-preview')` over the Gemini Live API). `connectToWebSocket` in `@ai-sdk/provider-utils` now passes close code and reason to `onClose` (additive, optional parameter).
