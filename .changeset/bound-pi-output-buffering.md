---
'@ai-sdk/harness-pi-v2': patch
---

The Pi adapter's bash tool now keeps the memory of the host process bounded. A sandbox command writes its output to `/tmp/pi-bash-<toolCallId>.log` in the sandbox while it runs, and the host keeps only the tail it displays plus the counts for the truncation notice, instead of holding the whole output of the command in memory. A command that produces more than 16MB of output is stopped. The `read` tool now refuses to read a file above a size limit into the host, where it used to read whole files of any size. A command that produced a lot of output or a large repository file could previously exhaust the memory of the agent process that hosts the session and serves other sessions.
