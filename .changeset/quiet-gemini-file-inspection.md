---
'@ai-sdk/google': patch
---

Add Extended Multimodal File Inspection options for Gemini documents, spreadsheets, audio, and video, including per-file rendering resolution. Add the `gemini-4-argon-file-processing-eap` and `gemini-3.8-flash-file-processing-eap` model IDs for early-access evaluation.

Send Interactions tool results as top-level `function_result` inputs so file selections remain inside their tool result and are accepted by the EAP API.
