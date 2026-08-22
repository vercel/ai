---
'@ai-sdk/alibaba': patch
'@ai-sdk/deepseek': patch
'@ai-sdk/groq': patch
'@ai-sdk/moonshotai': patch
'@ai-sdk/openai': patch
'@ai-sdk/perplexity': patch
---

Clamp text output token counts at zero when reported reasoning tokens exceed completion tokens.
