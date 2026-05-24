---
"@ai-sdk/mcp": patch
---

Await the optional `addClientAuthentication` callback in `exchangeAuthorization` and `refreshAuthorization`. The provider interface declares the callback as `void | Promise<void>`, but the call sites invoked it without `await`, so async implementations (e.g. ones that read credentials from a database) finished setting form parameters after the token-exchange request had already been dispatched. Matches the awaited call in `modelcontextprotocol/typescript-sdk` (`packages/client/src/client/auth.ts:1491`).
