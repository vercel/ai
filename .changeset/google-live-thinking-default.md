---
'@ai-sdk/google': patch
---

fix(google): send the default Gemini Live `thinkingLevel` when `thinkingConfig` sets neither `thinkingLevel` nor `thinkingBudget`, and stop overwriting a raw `generationConfig.thinkingConfig`
