---
"@ai-sdk/test-server": patch
"@ai-sdk/mcp": patch
"@ai-sdk/huggingface": patch
"@ai-sdk/baseten": patch
---

fix: use `del-cli` in `clean` scripts so package builds work on Windows

Four packages still ran `rm -rf` in their `clean` script, which fails on Windows PowerShell/CMD and broke `pnpm build` / `pnpm test` there. They now use the cross-platform `del-cli` (already a root devDependency) like every other package.
