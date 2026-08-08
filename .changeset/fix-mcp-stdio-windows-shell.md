---
'@ai-sdk/mcp': patch
---

Fix `Experimental_StdioMCPTransport` failing with `spawn ENOENT` on Windows when launching commands that resolve through `.cmd`/`.bat` shims (e.g. `npx`, `uv`, `npm`). Enable `shell: true` on `win32` so Node's `child_process.spawn` resolves PATH-installed shims; non-Windows behavior is unchanged. Closes #10732.
