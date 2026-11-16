---
'@ai-sdk/harness-fx-v2': patch
---

The fx adapter's `grep_files` tool frames the files of a recursive search with a NUL byte and greps them one at a time, instead of parsing `path:line:text` lines, so that a repository file named like `a:999999999999999999:b.txt` can no longer be read as a line number or have its matches attributed to the file `a`. A match line whose number is not a positive safe integer is dropped, and context lines are rendered only from the lines the sandbox returned, so a crafted file name cannot grow a result without end. Output for normal repositories is unchanged; a recursive search looks at up to 500 files and says so when a result is cut off at that limit.
