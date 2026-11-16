---
'@ai-sdk/google': patch
'@ai-sdk/google-vertex': patch
---

Limit the size of Google Vertex tool result file downloads with `toolResultDownloads.maxBytes`, which defaults to 7 MiB. This is lower than the previous 2 GiB default for these downloads; raise `toolResultDownloads.maxBytes` for larger files.
