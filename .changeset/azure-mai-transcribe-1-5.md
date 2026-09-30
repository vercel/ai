---
'@ai-sdk/azure': patch
---

Route `mai-transcribe-1.5` to the Azure Speech API by default, like `mai-transcribe-2`. MAI-Transcribe-1.5 requests no longer send the `segment` timestamps default, which the model rejects.
