---
'@ai-sdk/mcp': patch
---

fix(mcp): wait for the `server/discover` response over Streamable HTTP instead of falling back to `initialize` after 1 s. A modern-only server that answered discovery slowly, for example on a cold start, was downgraded to the legacy handshake and rejected it. stdio and custom transports keep the 1 s probe timeout.
