---
'@ai-sdk/google': patch
---

Map portable `reasoning: 'none'` and `'minimal'` to thinking level `low` for all `gemini-4-*` models, since `gemini-4-argon` and `gemini-4-carbon` reject `MINIMAL` with a 400.
