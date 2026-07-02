---
'@ai-sdk/amazon-bedrock': patch
---

Preserve Bedrock inference-profile ARNs unencoded in REST URL paths. Previously `encodeURIComponent` escaped `:` and `/` characters in ARN model IDs (e.g. `arn:aws:bedrock:...:application-inference-profile/abc123`), producing 400 "The provided model identifier is invalid" responses from Bedrock.
