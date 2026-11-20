---
'@ai-sdk/openai': patch
---

fix(openai): classify Amazon Bedrock OpenAI-compatible model ids as reasoning models. Cross-Region inference profile ids such as `global.openai.gpt-5.6-sol` or `us.openai.gpt-5.6-sol`, and Mantle's `openai.gpt-5.6-sol`, were not matched by the model id patterns, so `reasoningEffort` was silently dropped with an "unsupported for non-reasoning models" warning. The Bedrock region and `openai.` prefixes are now stripped before classification.
