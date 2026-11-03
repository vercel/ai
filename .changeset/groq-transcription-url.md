---
'ai': patch
'@ai-sdk/provider': patch
'@ai-sdk/groq': patch
---

Support native URL transcription with an optional provider capability, keeping existing file-generation contracts unchanged. Groq sends HTTP(S) audio URLs through its `url` parameter without downloading and re-uploading them, avoiding the attachment upload limit. Supplying a custom `download` function retains local download behavior.
