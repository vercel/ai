---
'@ai-sdk/tool-fs': patch
---

Replace backtracking glob regular expressions with a bounded state-machine matcher to prevent excessive host CPU use. Return structured search errors for invalid patterns and searches exceeding pattern, path, or per-path matching-work limits, and allow timeouts and caller cancellation to interrupt between files.
