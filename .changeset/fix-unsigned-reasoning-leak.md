---
"@ai-sdk/amazon-bedrock": patch
---

fix(amazon-bedrock): do not replay unsigned reasoning content in multi-turn messages

Reasoning parts without a `signature` or `redactedData` (e.g. from OpenAI models with extended thinking on Bedrock) are no longer replayed as `reasoningContent` blocks in multi-turn conversations. Replaying unsigned reasoning caused models to leak raw `<reasoning>` tags into the visible text response. Signed reasoning (Anthropic) and redacted reasoning are unaffected.
