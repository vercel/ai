---
'@ai-sdk/google': patch
'@ai-sdk/google-vertex': patch
---

fix(google): forward supported GCS tool result URLs as function response file data on Vertex Gemini 3 and later. Restrict forwarding to supported image, PDF, and text MIME types while preserving HTTP(S) downloads for tool results on all Gemini generations.
