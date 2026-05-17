---
"ai": minor
---

feat(ai/ui): add `convertToUIMessages` utility (inverse of `convertToModelMessages`)

Adds a public `convertToUIMessages(messages, { generateId? })` helper that turns an array of `ModelMessage`s — for example the `response.messages` returned by `generateText` / `streamText` or supplied in `onFinish` callbacks — into an array of `UIMessage`s suitable for persistence and `useChat` rendering. Tool model messages are merged into the matching tool-call part on the immediately preceding assistant message, transitioning state to `output-available` / `output-error` / `output-denied` depending on the tool-result output shape.

Closes #7180.
