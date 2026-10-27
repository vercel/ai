---
'@ai-sdk/openai': patch
---

fix(openai): only send transcription response format and timestamp defaults when needed

Transcription requests no longer send `response_format=verbose_json` or `timestamp_granularities[]=segment` unless the caller sets them or the model needs them. Previously, any `providerOptions.openai` value (such as a `prompt`) caused `verbose_json` to be sent for models like `gpt-transcribe`, which rejected the request.
