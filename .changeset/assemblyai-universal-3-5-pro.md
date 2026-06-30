---
'@ai-sdk/assemblyai': patch
---

feat(assemblyai): support `universal-3-5-pro` and other current speech models

Adds `universal-3-5-pro`, `universal-3-pro`, and `universal-2` to the
transcription model ids. These newer models are only accessible through
AssemblyAI's `speech_models` request parameter (the singular `speech_model`
parameter is deprecated and rejects them), so the provider now routes the model
id to the correct parameter automatically: the legacy `best` model continues to
use `speech_model`, while all other models use `speech_models`.

The `best` model is now deprecated. It continues to work, but the model id type
marks it `@deprecated` and the provider emits a deprecation warning when it is
used. Prefer `universal-3-5-pro` instead. The `nano` model has been removed, as
AssemblyAI no longer supports it (the API now rejects it).
