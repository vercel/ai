---
'@ai-sdk/mcp': patch
---

fix(mcp): prevent prototype-named tools from bypassing the `schemas` allowlist

When using `client.tools({ schemas })` to expose only an explicitly allowed
subset of an MCP server's tools, the allowlist check used the `in` operator,
which also matches inherited `Object.prototype` properties. A server-advertised
tool named `constructor`, `toString`, `__proto__`, etc. would pass the check
even though the developer never defined it in `schemas`, and was then exposed to
the model and executable. The check now uses `Object.hasOwn`, so only
explicitly defined tools are returned.
