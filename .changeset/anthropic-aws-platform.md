---
'@ai-sdk/anthropic-aws': patch
---

feat(anthropic-aws): add Claude Platform on AWS provider package

New `@ai-sdk/anthropic-aws` package exporting `createAnthropicAws` for [Claude Platform on AWS](https://aws.amazon.com/marketplace) — Anthropic's Messages API hosted in AWS at `aws-external-anthropic.{region}.api.aws`. Same wire format and feature set as `@ai-sdk/anthropic` (model IDs, streaming, prompt caching, tool use, computer use, Agent Skills, `anthropic-beta` headers) with AWS SigV4 or AWS-provisioned API key authentication.

Reads `AWS_REGION`, `ANTHROPIC_AWS_WORKSPACE_ID`, and `ANTHROPIC_AWS_API_KEY` from the environment by default.
