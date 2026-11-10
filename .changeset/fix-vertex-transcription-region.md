---
'@ai-sdk/google-vertex': patch
---

Reject invalid Cloud Speech transcription regions and default locations before resolving credentials or sending requests, preventing URL delimiters from redirecting bearer tokens and audio to another host.
