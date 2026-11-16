---
'@ai-sdk/harness-pi-v2': patch
---

The Pi adapter's bash tool now keeps the memory of the host process bounded. It keeps only the tail of a command's output that it displays, together with the byte and line counts of the whole output for the truncation notice, instead of holding all of the output in memory. When the result is truncated, that retained tail is written to `/tmp/pi-bash-<toolCallId>.log` in the sandbox and the notice says whether the file holds the full output or only the tail, which means that output beyond the retained tail is no longer saved in full. A command that produces more than 16MB of output is stopped, and the `read` tool refuses to read a file above a size limit into the host, where it used to read whole files of any size. A command that produced a lot of output or a large repository file could previously exhaust the memory of the agent process that hosts the session and serves other sessions.
