---
'ai': patch
---

fix(ai): guard against missing `inputTokens` / `outputTokens` in provider usage

`asLanguageModelUsage` now reads `usage.inputTokens?.total` and
`usage.outputTokens?.total` (and the nested detail fields) with optional
chaining. Some providers in the wild (and instrumented call paths such as
`@trigger.dev` task wrappers) return `usage` objects that omit
`inputTokens` / `outputTokens` entirely, which crashed with
`TypeError: Cannot read properties of undefined (reading 'total')` inside
`generateText` and `streamText` telemetry recording (see #15446).

Closes #15446.
