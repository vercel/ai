---
'@ai-sdk/openai': patch
---

fix(provider/openai): do not set `response_format` to `verbose_json` if model is `gpt-4o-transcribe` or `gpt-4o-mini-transcribe`

These two models do not support it:
https://platform.openai.com/docs/api-reference/audio/createTranscription#audio_createtranscription-response_format
