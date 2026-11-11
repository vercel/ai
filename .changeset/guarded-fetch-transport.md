---
'@ai-sdk/provider-utils': patch
'@ai-sdk/mcp': patch
---

Move Node.js connection-time DNS validation to the optional `guarded-fetch` package. It uses an Undici agent to validate every resolved address and pin the connection to those results, independently of global fetch wrappers. It supports explicitly trusted private origins and connection-pool cleanup.

**Security behavior change:** provider-utils now uses the configured fetch or the runtime's global fetch and no longer depends on Undici. Default URL checks still reject private IP literals, local hostnames, unsafe schemes, and unsafe redirect URLs, but do not block public-looking hostnames that resolve to private addresses or DNS rebinding. Applications fetching untrusted URLs should inject `createGuardedFetch()` on Node.js or enforce equivalent network egress restrictions.

Allow `downloadBlob` to accept a fetch transport so applications can apply the same protection to file downloads.

MCP OAuth discovery keeps its strict DNS requirement: because Node.js no longer has a DNS-pinned default transport, untrusted authorization-server, redirect, token, and registration URLs now require an explicit custom fetch with connection-time DNS validation on Node.js too. Pass `createGuardedFetch()` through `transport.fetch`. The configured MCP server origin and browser window discovery remain supported.
