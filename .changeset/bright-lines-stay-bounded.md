---
'@ai-sdk/tool-fs': patch
---

Avoid repeated file scans when reporting ambiguous edits. Calculate diagnostic line numbers in one forward scan and limit the error to the first 20 locations while preserving the total match count.
