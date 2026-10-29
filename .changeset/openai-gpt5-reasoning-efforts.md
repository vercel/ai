---
'@ai-sdk/openai': patch
---

fix(openai): map top-level `reasoning` to efforts supported by GPT-5.x models instead of sending unsupported values that OpenAI rejects with a 400. `max` is now only sent on the Responses API, and GPT-5.6 on Chat Completions sends `reasoning_effort: 'none'` when function tools are used, since it rejects function tools with reasoning. A warning is emitted when a reasoning level was requested.
