---
'@ai-sdk/xai': patch
---

feat (provider/xai): add `referenceVoiceIds` for reference-to-video reference audio. Pass up to 3 xAI preset voice ids (e.g. `['eve']`) and reference them from the prompt with `<AUDIO_0>`–`<AUDIO_2>`; they are sent as `reference_audios: [{ voice_id }]` on `POST /v1/videos/generations`.
