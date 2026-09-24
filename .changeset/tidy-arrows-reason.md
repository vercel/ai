---
'@ai-sdk/open-responses': patch
'@ai-sdk/quiverai': patch
---

Add QuiverAI Arrow 2 language models through the Responses API, with provider-local reasoning validation, stateless history replay, and workflow serialization that preserves QuiverAI configuration and behavior.

Add reusable Open Responses transport configuration, response-error metadata extraction for generation and streaming, cache-write accounting, and OpenAI-compatible custom tools. Preserve text, image, and file custom-tool results and complete tool inputs when streaming deltas are omitted.
