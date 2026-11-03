---
'@ai-sdk/mistral': patch
---

fix(mistral): map `reasoning: 'none'` to a supported effort for Mistral Large 4

Mistral Large 4 (`mistral-large-4`, `mistral-large-4-0`) rejects `reasoning_effort: 'none'`. The Chat API now sends `'low'` and the Conversations API sends `'high'` (the only effort that endpoint accepts for this model), each with a compatibility warning. `reasoning: 'low'` and `'medium'` are now passed through on the Chat API instead of being sent as `'high'`, and `providerOptions.mistral.reasoningEffort` accepts `'medium'`.

