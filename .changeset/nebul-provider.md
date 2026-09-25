---
'@ai-sdk/nebul': major
---

Add Nebul as an AI SDK provider ([#20445](https://github.com/vercel/ai/issues/20445)). Adds the new `@ai-sdk/nebul` package with support for Nebul's OpenAI-compatible Inference API: language models (`nebul.chat` / `nebul.languageModel`, with reasoning, tool calling, and structured output), embedding models (`nebul.embeddingModel`), image models (`nebul.imageModel`), transcription models (`nebul.transcriptionModel`), speech models (`nebul.speechModel`), reranking models (`nebul.rerankingModel`), and a runtime model catalog (`nebul.getAvailableModels`, cached for 5 minutes).
