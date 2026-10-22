---
'@ai-sdk/openai': patch
'@ai-sdk/anthropic': patch
'@ai-sdk/google': patch
'@ai-sdk/alibaba': patch
'@ai-sdk/amazon-bedrock': patch
'@ai-sdk/cohere': patch
'@ai-sdk/deepseek': patch
'@ai-sdk/groq': patch
'@ai-sdk/huggingface': patch
'@ai-sdk/mistral': patch
'@ai-sdk/moonshotai': patch
'@ai-sdk/open-responses': patch
'@ai-sdk/perplexity': patch
'@ai-sdk/xai': patch
---

Report `interrupted` when a stream ends cleanly without its provider completion signal, preserving partial output without emitting an error solely for the interruption.

This applies to OpenAI (Chat, Responses, and Completions), Anthropic, Google (Generate Content and Interactions), Alibaba, Amazon Bedrock Converse, Cohere, DeepSeek, Groq, Hugging Face Responses, Mistral Chat, Moonshot AI, Open Responses, Perplexity, and xAI Responses. It also covers cutoffs in later Anthropic messages and Google automatic continuations.

**Compatibility notice:** These streams previously fell back to `other` or omitted the finish part. Applications must now handle `interrupted` in finish-reason switches, mappings, and custom validation. Check `finishReason === 'interrupted'` to detect incomplete responses; interruption alone does not trigger error handling.

Explicit unknown completion reasons still map to `other`. Actual provider, parsing, and transport errors retain their error paths; affected error paths that previously left the finish reason as `other` now report `error`. OpenAI-compatible remains unchanged.
