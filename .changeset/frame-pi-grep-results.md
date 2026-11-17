---
'@ai-sdk/harness-pi-v2': patch
---

The Pi adapter's `grep` tool frames the results of a recursive search with NUL bytes around each file name, so a repository file whose name contains `:digits:` can no longer be read as a line number and drive the tool into a loop that exhausted the host process. Context lines are now rendered from the lines that the sandbox returned, and line numbers that are not positive safe integers are dropped.
