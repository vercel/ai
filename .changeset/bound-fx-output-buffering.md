---
'@ai-sdk/harness-fx-v2': patch
---

The fx adapter's built-in tools now keep the memory of the host process bounded. The `shell` tool keeps only a bounded head and tail of a command's output, stops a command that floods its output, and no longer stores an exact copy of output it did not keep. `read_file` reads a snapshot of a file that is larger than its read limit with a bounded command in the sandbox, and `edit_file` and `write_file` check a file's size and read at most a bounded preimage, instead of downloading the whole file. `glob_files` and `grep_files` keep at most a bounded amount of the output of the commands they run and report a cut-off result, and `grep_files` reads context lines only for a file within its context limit, with a bounded read. Previously a command, a repository file, or a search over a large repository could exhaust the memory of the agent process that hosts the session.
