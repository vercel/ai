---
'@ai-sdk/anthropic': patch
---

Preserve final JSON text when a model answers without calling the JSON response tool, including open-schema fallbacks on Claude models that reject forced tools. Keep tool preambles out of structured output in generation and streaming.

When the model answers in text, streaming buffers that text until the message finishes to avoid exposing tool preambles as partial structured output.
