---
'@ai-sdk/amazon-bedrock': patch
---

Add `requestMetadata` support to the Converse and ConverseStream APIs via `providerOptions.amazonBedrock.requestMetadata`. Accepts a `Record<string, string>` for per-request tagging in Amazon Bedrock invocation logs for cost attribution.
