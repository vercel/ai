---
'@ai-sdk/openai-compatible': patch
'@ai-sdk/fireworks': patch
---

Add a `supportsMultipartToolResults` provider capability and enable it for Fireworks. Content-type tool results are converted to structured content parts instead of JSON text, preserving images and other supported media. Other OpenAI-compatible providers retain their existing serialization unless the capability is enabled.
