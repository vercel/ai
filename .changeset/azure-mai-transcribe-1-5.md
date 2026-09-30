---
'@ai-sdk/azure': patch
---

Route `mai-transcribe-1.5` and `mai-transcribe-1` to the Azure Speech API by default, like `mai-transcribe-2`. MAI-Transcribe-1.x requests no longer send the `segment` timestamps default, which those models reject.
