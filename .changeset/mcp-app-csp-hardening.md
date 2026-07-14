---
'@ai-sdk/react': patch
---

fix (react/mcp-apps): sanitize server-supplied CSP domains in `getMCPAppCSP` so values cannot inject extra directives, sources, or policies into the generated Content-Security-Policy
