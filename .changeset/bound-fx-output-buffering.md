---
'@ai-sdk/harness-fx-v2': patch
---

The fx adapter's `shell`, `read_file`, `edit_file`, and `write_file` built-in tools now keep the memory of the host process bounded. The `shell` tool keeps only a bounded head and tail of a command's output, stops a command that floods its output, and no longer stores an exact copy of output it did not keep. `read_file` streams at most a snapshot of a file, and `edit_file` and `write_file` check a file's size before reading it, instead of downloading the whole file. Previously a command or a repository file could exhaust the memory of the agent process that hosts the session.
