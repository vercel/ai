---
'@ai-sdk/mcp': patch
---

Bind OAuth credentials and pending authorization flows to their authorization-server issuer and token endpoint. Validate discovery issuers, preserve bindings through refresh retries, and reject mismatched callbacks before code exchange. Pre-registered confidential clients must configure their issuer or a trusted stored binding; unbound legacy refresh tokens require fresh authorization.
