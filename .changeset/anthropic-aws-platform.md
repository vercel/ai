---
'@ai-sdk/provider-utils': minor
'@ai-sdk/amazon-bedrock': patch
'@ai-sdk/anthropic': patch
---

Add `@ai-sdk/anthropic/aws` subpath exporting `createAnthropicAws` for Claude Platform on AWS. Same Anthropic Messages API as the first-party client, but routes through the AWS-hosted endpoint (`aws-external-anthropic.{region}.api.aws`) with AWS SigV4 or AWS-provisioned API key authentication. Reads `AWS_REGION`, `ANTHROPIC_AWS_WORKSPACE_ID`, and `ANTHROPIC_AWS_API_KEY` from the environment by default.

Adds a shared AWS SigV4 fetch helper at `@ai-sdk/provider-utils/aws` (`createSigV4FetchFunction`, `AwsSigV4Credentials`) parameterized by service name and user-agent suffix. `@ai-sdk/amazon-bedrock` now delegates to this shared helper internally; public API is unchanged.
