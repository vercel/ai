---
'@ai-sdk/react': patch
'@ai-sdk/mcp': patch
---

Harden MCP Apps handling of server-supplied resource metadata and the host/iframe bridge:

- Runtime-validate `_meta.ui` and drop malformed or non-string fields.
- Gate iframe permissions deny-by-default via a new `sandbox.allowedPermissions` allowlist.
- Derive a concrete `postMessage` target origin and validate inbound message origins.
- Validate inbound bridge params: limit `resources/read` to `ui://` resources and allow only `https`/`http`/`mailto` in `ui/open-link`.
- Add `fingerprintMCPAppResource` / `detectMCPAppResourceDrift` for pinning and comparing app resources.
