---
'@ai-sdk/google': patch
---

Preserve per-modality token details (`promptTokensDetails`, `candidatesTokensDetails`) from Gemini API responses in usage data. Previously these fields were stripped during Zod parsing, preventing downstream consumers from distinguishing token counts by modality (text, image, audio, video).
