---
"@ai-sdk/google": patch
---

fix(google): emit Vertex no-args streaming tool calls and preserve thoughtSignature

Vertex emits a no-args function call as a single chunk shaped `{ functionCall: { name: 'X' } }` with no `args`, no `partialArgs`, and no `willContinue`. The streaming parser had no branch for this shape, so the call was dropped along with any `thoughtSignature` it carried. For Gemini 3 thinking models this caused the next multi-turn step to 400 with `missing thought_signature`. The unary (`doGenerate`) path had the same drop.

Both paths now emit the call as a complete tool call with `'{}'` input and propagate `thoughtSignature` provider metadata.

Fixes #14847.
