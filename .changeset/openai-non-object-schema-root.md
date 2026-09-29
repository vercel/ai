---
'@ai-sdk/openai': patch
---

Fall back to `json_object` response format when the structured output schema root is not an object. OpenAI rejects a non-object root for `json_schema` with `invalid_json_schema`, so `generateText({ output })` calls with e.g. a top-level array schema failed with a 400. The schema is now passed through the prompt instead of the `response_format`, and a warning explains that the response format is no longer enforced by the schema.
