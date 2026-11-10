---
'@ai-sdk/mcp': patch
---

fix(mcp): reject with the network error when `server/discover` fails over Streamable HTTP instead of falling back to `initialize` against the same unreachable server
