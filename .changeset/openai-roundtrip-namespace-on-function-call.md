---
"@ai-sdk/openai": patch
---

fix(openai): round-trip `namespace` on function_call input items

When `tool_search` dispatches a deferred tool, the resulting `function_call` carries a `namespace` field identifying which deferred-tool group the model picked. `#14789` preserved this on the read side (`providerMetadata.openai.namespace`), but the write side still serialized `function_call` input items without `namespace`. Multi-step / multi-turn conversations then failed with `Missing namespace for function_call '<name>'. ... Round-trip the model's function_call item with its namespace field included.`

`convert-to-openai-responses-input.ts` now reads `namespace` from `providerOptions.openai.namespace` (or `providerMetadata.openai.namespace`) on `tool-call` parts and includes it on the serialized `function_call` item, mirroring how `itemId` is round-tripped.
