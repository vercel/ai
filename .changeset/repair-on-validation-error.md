---
"ai": patch
---

feat(ai): add experimental_repairOnValidationError option to generateText and generateObject

When schema validation fails, setting `experimental_repairOnValidationError: true` (or a number for multiple attempts) automatically retries generation with the Zod validation error appended to the conversation. This is particularly useful in production when working with smaller models that are prone to hallucinating incorrect field types, as it increases reliability without requiring manual retry logic. Token usage from repair calls is accumulated in the result's `totalUsage`.

The result also exposes `experimental_repairHistory`: an array of `{ text, error }` pairs for every failed attempt, making it easy to collect high-quality training data to fine-tune models to produce correct schemas out of the gate.
