---
'@ai-sdk/openai-compatible': patch
---

fix(openai-compatible): inject JSON schema instruction when structuredOutputs is disabled. Improves reliability of generateText + Output.object() with OpenAI-compatible providers that don't support json_schema response format.
