---
'@ai-sdk/provider-utils': patch
'@ai-sdk/openai': patch
'@ai-sdk/anthropic': patch
'@ai-sdk/google': patch
---

Give OpenAI, Anthropic, and Google explicit evaluation model catalogs with a reasoning effort for every supported ID. Evaluations use disabled thinking where available or the model's lowest supported effort, instead of requesting `none` for every model. The catalogs cover recent text models and retain the IDs used by the evaluation examples. Unlisted IDs now throw `NoSuchModelError` when creating an evaluation model; new releases, snapshots, and deployment aliases require explicit catalog entries.

Keep these defaults inside the experimental evaluation implementation. Ordinary language-model generation and its reasoning mappings are unchanged. Explicit native reasoning controls override evaluation defaults without adding conflicting settings, and workflow serialization preserves the selected defaults. Evaluations can still consume reasoning tokens.
