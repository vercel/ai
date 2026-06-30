---
'@ai-sdk/assemblyai': patch
---

feat(assemblyai): add Universal-3-Pro input params and deprecate wordBoost

Adds provider options for the newer AssemblyAI request parameters:

- `prompt` — natural-language prompting (Universal-3 Pro / SLAM-1)
- `keytermsPrompt` — domain keyterm boosting (replaces `wordBoost` for newer models)
- `temperature` — sampling temperature (Universal-3 Pro)
- `removeAudioTags` — strip inline annotations (Universal-3 Pro)
- `domain` — domain-specific model, e.g. `'medical-v1'`

Deprecates `wordBoost` and `boostParam`: AssemblyAI rejects `word_boost` with a
400 on `universal-3-pro` / `universal-3-5-pro` / `slam-1` (it only works on the
legacy `universal-2`/`best` models). Using either option now emits a deprecation
warning pointing to `keytermsPrompt`.
