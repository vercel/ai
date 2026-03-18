---
"@ai-sdk/anthropic": patch
"@ai-sdk/google-vertex": patch
---

fix(google-vertex): disable fine-grained tool streaming for Anthropic provider

Added `supportsFineGrainedToolStreaming` config option to AnthropicMessagesConfig
to allow Google Vertex provider to disable the problematic beta header that
causes malformed tool call JSON responses.
