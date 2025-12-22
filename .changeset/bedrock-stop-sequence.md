---
'@ai-sdk/amazon-bedrock': patch
---

feat(provider/amazon-bedrock): expose stop_sequence in provider metadata

The Bedrock provider now exposes the specific stop sequence that triggered generation to halt via `providerMetadata.bedrock.stopSequence`. This is implemented by:

- Requesting `/stop_sequence` via `additionalModelResponseFieldPaths` in the API call
- Parsing the value from `additionalModelResponseFields.stop_sequence` in both generate and stream responses
- Exposing it as `stopSequence` in the provider metadata (returns `null` when no stop sequence was matched)
