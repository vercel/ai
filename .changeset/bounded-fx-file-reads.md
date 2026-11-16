---
'@ai-sdk/harness-fx-v2': patch
---

The fx adapter's built-in tools no longer load a whole file into the host process. `read_file`, `edit_file`, `write_file` and the context lines of `grep_files` read a file only with a bounded command in the sandbox, so a file that grows or is replaced between its stat and its read cannot make the agent process hold more than the tool's limit. A read the sandbox cannot bound is reported instead of being retried as a whole-file read: `read_file` returns an error, `edit_file` reports that it cannot read the preimage, `write_file` writes without comparing, and `grep_files` shows the match without context lines. Previously a sandbox whose stat underreported a file's size, or that could not run the encoded read, made the host hold the whole file.
