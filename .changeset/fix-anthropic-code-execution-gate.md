---
'@ai-sdk/anthropic': patch
---

fix(provider/anthropic): gate the `programmatic-tool-call` discriminator injection
on `markCodeExecutionDynamic` at all three rewrite sites in
`anthropic-language-model.ts`. When a user explicitly registers `code_execution`
as a tool, the input is no longer rewritten with the synthetic discriminator the
user's schema doesn't expect — matching the existing gate pattern on the four
sibling `dynamic: true` emission sites. Closes #15951.
