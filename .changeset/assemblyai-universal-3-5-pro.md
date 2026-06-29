---
'@ai-sdk/assemblyai': patch
---

feat(assemblyai): support `universal-3-5-pro` and other current speech models

Adds `universal-3-5-pro`, `universal-3-pro`, and `universal-2` to the
transcription model ids. These newer models are only accessible through
AssemblyAI's `speech_models` request parameter (the singular `speech_model`
parameter is deprecated and rejects them), so the provider now routes the model
id to the correct parameter automatically: the legacy `best` and `nano` models
continue to use `speech_model`, while all other models use `speech_models`.
