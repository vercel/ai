---
"@ai-sdk/deepseek": patch
---

fix(provider/deepseek): preserve `reasoning_content` for `deepseek-v4` in multi-turn requests

DeepSeek V4 thinking mode requires `reasoning_content` on every assistant message in multi-turn requests; otherwise the API returns `400 The reasoning_content in the thinking mode must be passed back to the API.` The converter now preserves prior reasoning for `deepseek-v4*` models and back-fills an empty string when no reasoning part is present. `deepseek-reasoner` (R1) behavior — which forbids echoing prior reasoning — is unchanged.
