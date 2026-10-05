---
'@ai-sdk/mcp': patch
---

Preserve stored OAuth credentials when an authorization-code exchange returns `invalid_grant`, without retrying the rejected code.

Add optional token context to `OAuthClientProvider.invalidateCredentials` so providers sharing storage can atomically delete only the rejected token generation and preserve tokens saved by a concurrent refresh.
