---
'@ai-sdk/openai': patch
---

fix(provider/openai): skip duplicate items when `previousResponseId` is set in Responses API

When using the Responses API with `providerOptions.openai.previousResponseId` and `store: true`, prior assistant items were emitted as `item_reference`s in `input` while ALSO being present in the chain via `previous_response_id`. OpenAI rejects this with `400 Duplicate item found with id rs_...`.

The dedup already existed for `conversation` (`hasConversation` flag); this PR adds the equivalent `hasPreviousResponseId` flag and applies it to the same five skip sites (assistant text, tool call, tool result, reasoning, compaction). Behavior is unchanged when neither `conversation` nor `previousResponseId` is set, and unchanged for `conversation` users.

Reported pattern: multi-step tool loops using `streamText` with `previousResponseId` advanced per step via `prepareStep`/`onStepFinish` (the documented way to preserve reasoning state across reasoning-model tool calls).
