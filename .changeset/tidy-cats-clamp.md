---
'@ai-sdk/alibaba': patch
'@ai-sdk/deepseek': patch
'@ai-sdk/groq': patch
'@ai-sdk/moonshotai': patch
'@ai-sdk/openai': patch
'@ai-sdk/perplexity': patch
---

Prevent negative text output token counts when providers report reasoning tokens. Perplexity reasoning tokens are now treated as separate from completion tokens.
