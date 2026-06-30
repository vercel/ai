---
'@ai-sdk/assemblyai': patch
---

feat(assemblyai): nudge universal-3-pro/universal-2 users toward universal-3-5-pro

Using `universal-3-pro` or `universal-2` now emits an informational warning
(`type: 'other'`, not a deprecation) noting that `universal-3-5-pro` is
AssemblyAI's latest flagship model and is set to replace `universal-3-pro`. Both
models remain fully supported.
