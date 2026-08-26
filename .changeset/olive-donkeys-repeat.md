---
"@ai-sdk/harness-claude-code": patch
"@ai-sdk/harness": patch
---

fix(harness-claude-code): stream tool input instead of discarding it

`createEmitStreamEvent` registered `content_block_start` for `text` and `thinking` only, so a `tool_use` block never entered `partialBlocks` and its `input_json_delta` events were dropped. Tool input now streams as `tool-input-start` / `tool-input-delta` / `tool-input-end`, carrying the same id as the `tool-call` that follows.
