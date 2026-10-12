---
'@ai-sdk/cartesia': patch
---

Default unknown transcription model IDs to the current streaming protocol, while retaining batch-only handling for Ink Whisper. New streaming models are no longer rejected or sent to the batch endpoint.
