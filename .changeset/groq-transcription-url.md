---
'ai': patch
'@ai-sdk/provider': patch
'@ai-sdk/groq': patch
---

Support native URL transcription with an optional provider capability, keeping existing file-generation contracts unchanged. Groq sends HTTP(S) audio URLs through its `url` parameter without downloading and re-uploading them, avoiding the attachment upload limit. Supplying a custom `download` function retains local download behavior.

For telemetry integrations, `TranscriptionEndEvent.audio.byteLength` and `audio.mediaType` can now be `undefined` when a provider fetches the audio URL natively. Check for missing values before using them as a number or string. Downloaded and inline audio continue to report their metadata; streaming transcription metadata is unchanged.
