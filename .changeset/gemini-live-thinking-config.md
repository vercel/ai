---
'@ai-sdk/google': patch
---

feat(google): realtime session options for Gemini 3.8 Live

Add `thinkingConfig` (`thinkingLevel`, `thinkingBudget`, `includeThoughts`) and
`defaultToolBehavior` to `GoogleRealtimeModelOptions`. `thinkingConfig` is merged
into the Live `setup.generationConfig`. Background-reasoning Live models such as
`gemini-3.8-live-extended-thinking` require exactly one of `thinkingLevel` or
`thinkingBudget`, so the provider sends `thinkingLevel: 'low'` on those models
when neither is set. `defaultToolBehavior` stamps `behavior` on every function
declaration in the setup.

Forward the Live `interactionStatus` and `waitingForInput` server messages as
custom events so applications can tell when a background-reasoning model is idle,
since `turnComplete` alone no longer means that.
