---
'@ai-sdk/tool-fs': patch
---

Process internal whitespace runs in linear time when normalizing edit matches, preventing excessive host CPU usage for sandbox files with long space or tab runs.
