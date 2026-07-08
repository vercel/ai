---
'@ai-sdk/deepgram': patch
---

Fix transcription provider options `paragraphs`, `intents`, `sentiment`, `replace`, and `keyterm` being accepted by the options schema but never sent to the Deepgram API.
