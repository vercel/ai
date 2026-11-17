---
'@ai-sdk/mcp': patch
---

Prevent newly registered OAuth clients from supplying an authorization server binding for existing unbound refresh tokens. Clear unbound tokens before saving new registration information, and stop authorization if they remain in storage.
