---
'@ai-sdk/react': patch
---

Fix MCP App iframe CSP generation in `getMCPAppCSP` to include declared `resourceDomains` in `script-src`, `style-src`, and `media-src` in addition to `img-src` and `font-src`.
