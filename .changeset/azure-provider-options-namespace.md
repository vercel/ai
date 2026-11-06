---
'@ai-sdk/azure': patch
'@ai-sdk/openai': patch
---

Accept Azure OpenAI options under `providerOptions.azure` for chat, transcription, speech, and image models that call the OpenAI API. They are merged with `providerOptions.openai`, and `azure` wins on conflicts, matching Azure completion models. For example, `providerOptions.azure.language` now reaches GPT-4o Transcribe deployments instead of producing a "requires MAI streaming transcription" warning. OpenAI-only options sent to the Azure Speech or MAI APIs produce an unsupported-option warning.
