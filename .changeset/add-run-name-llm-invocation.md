---
'ai': patch
'@ai-sdk/provider': patch
'@ai-sdk/devtools': patch
---

Add runName option to LLM invocations (generateText, streamText, generateObject, streamObject). Used by devtools and telemetry to display a descriptive title for the run instead of the prompt preview.
