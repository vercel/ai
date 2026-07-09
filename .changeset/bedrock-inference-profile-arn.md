---
"@ai-sdk/amazon-bedrock": patch
---

fix(amazon-bedrock): support inference profile ARNs as model ids. The provider built request URLs with `encodeURIComponent(modelId)`, which encodes the `/` in an application inference profile ARN (e.g. `arn:aws:bedrock:...:application-inference-profile/abc123`) to `%2F` and made Bedrock reject it with `400 The provided model identifier is invalid`. Model ids are now encoded per path segment so slashes stay literal, matching the path format Bedrock expects.
