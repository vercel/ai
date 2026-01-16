---
'ai': patch
---

fix(ai): propagate providerMetadata during input-streaming state

Provider-executed tools (like MCP tools) need to send metadata during the streaming phase, but the implementation only set `callProviderMetadata` when `part.state === "input-available"`. This fix removes the overly-restrictive state check and adds `callProviderMetadata` to the input-streaming state types and schemas.
