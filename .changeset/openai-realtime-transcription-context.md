---
'@ai-sdk/openai': patch
---

fix(openai): send `prompt`, `keywords` and `languages` in realtime transcription sessions

`doStream` warned that `prompt`, `keywords` and `languages` were unsupported and dropped them, but the realtime transcription session accepts all three under `session.audio.input.transcription`. These are the model's context controls — OpenAI reports semantic accuracy rising from 38.5% to 44.6% on their context-aware ASR benchmark when `prompt` is supplied — so streaming transcription had no way to be told domain vocabulary. They are now sent through; `include`, `temperature` and `timestampGranularities` remain REST-only.
