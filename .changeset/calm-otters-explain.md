---
'@ai-sdk/mcp': patch
---

Improve unsupported-version discovery errors when a server advertises a compatible legacy version. Include the requested and advertised versions and explain how to explicitly select legacy initialization with `protocolVersionDiscovery: false`, while preserving the original error details and avoiding automatic legacy fallback.
