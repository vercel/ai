---
'@ai-sdk/amazon-bedrock': patch
---

fix(bedrock): support encrypted `reasoningContent.redactedContent` in Converse responses and streams

The Converse API returns encrypted reasoning as the documented `redactedContent` union member (e.g. for OpenAI models served on Bedrock). Previously these chunks failed stream schema validation and terminated the stream with `AI_TypeValidationError`. They are now surfaced as reasoning parts with `redactedContent` provider metadata and replayed back to the API unchanged.
