---
'@ai-sdk/openai': patch
'@ai-sdk/provider': patch
'ai': patch
---

Fix non-streaming Responses API structured output failing when multiple assistant messages contain JSON. Providers can supply separate structured-output text for parsing, allowing OpenAI and Azure Responses models to select the last `final_answer` while preserving all generated content, annotations, conversation history, and token usage.
