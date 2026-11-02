---
'@ai-sdk/mcp': patch
---

Bind OAuth credentials and pending authorization flows to their authorization-server issuer and token endpoint. Validate discovery issuers, preserve bindings through refresh retries, and reject mismatched callbacks before code exchange. Pre-registered confidential clients must configure their issuer or a trusted stored binding; unbound legacy refresh tokens require fresh authorization.

Persist the complete authorization-server binding before redirecting, using writable client information, the authorization-server storage hooks, or fully pinned read-only client configuration. Fixed client configuration must provide separate binding storage when it only specifies an issuer. Providers must explicitly identify dynamically registered client information with `isClientInformationDynamicallyRegistered` and support invalidation to recover automatically from unbound legacy registrations or expired client credentials; otherwise configure a trusted binding or reset the old registration manually. Issuer/endpoint changes throw before credential exchange and require the application to clear the old credentials before reauthorization.
