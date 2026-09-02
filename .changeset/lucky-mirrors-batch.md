---
'@ai-sdk/harness-pi': patch
---

fix (harness-pi): transfer the workspace mirror as batched archives instead of one request per file

`syncHostWorkspaceFromSandbox` read every in-scope file with its own sequential `readBinaryFile` call, on session start and again on every turn. The scoped tree (`.pi`, `.agents`, root `AGENTS.md`) is walked recursively, so a repository that ships agent skills as `.agents/skills/<name>/SKILL.md` made thousands of round trips per turn and exhausted the request budget of sandboxes whose filesystem calls are network calls (reported as `429 Rate limit exceeded` from a MicroVM proxy). Files are now transferred in batches of 300 as a single gzipped tar archive per batch, with the previous per-file reads kept as a fallback for sandboxes without `tar`, `gzip`, or `base64`.
