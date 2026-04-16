---
"@ai-sdk/anthropic": patch
---

fix(provider/anthropic): stop adding `fine-grained-tool-streaming-2025-05-14` beta for `claude-opus-4-7`. The feature is GA for this model — Anthropic's migration guide says to remove the beta flag, and Bedrock's passthrough validation rejects it on Opus 4.7, breaking every streaming request through `@ai-sdk/amazon-bedrock`'s `createBedrockAnthropic`. Other Claude models still receive the beta unchanged.
