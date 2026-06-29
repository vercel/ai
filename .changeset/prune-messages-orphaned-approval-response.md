---
'ai': patch
---

fix(ai): prune orphaned tool-approval responses in `pruneMessages`

When pruning a specific tool by name (`toolCalls: [{ type, tools: [...] }]`), `pruneMessages` left the tool's `tool-approval-response` in place while removing its `tool-approval-request` and `tool-call`. The tool name of an approval response was resolved per-message, but approval responses live in a separate `tool` message from their approval request, so the name could never be resolved and the response was always kept. Tool name resolution is now done across all messages, so approval requests and responses are pruned together.
