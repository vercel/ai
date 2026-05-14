---
'@ai-sdk/amazon-bedrock': patch
---

fix(amazon-bedrock): disable native structured output for `claude-opus-4-7` on Bedrock Anthropic. Bedrock rejects `output_config.format` for this model (including the `us.`/`eu.` cross-region inference profiles) with `Extra inputs are not permitted`; the SDK now falls back to the `jsonResponseTool` path for it.
