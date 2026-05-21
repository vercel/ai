---
'@ai-sdk/anthropic-aws': major
---

feat(anthropic-aws): new @ai-sdk/anthropic-aws provider for Claude Platform on AWS

New `@ai-sdk/anthropic-aws` package exposing `createAnthropicAws` for [Claude Platform on AWS](https://aws.amazon.com/marketplace) — Anthropic's Messages API hosted in AWS at `aws-external-anthropic.{region}.api.aws`. Same wire format and feature set as `@ai-sdk/anthropic` (model IDs, streaming, prompt caching, tool use, computer use, Agent Skills, Files API, `anthropic-beta` headers) with AWS SigV4 or AWS-provisioned API key authentication.

Reads `AWS_REGION`, `ANTHROPIC_AWS_WORKSPACE_ID`, and `ANTHROPIC_AWS_API_KEY` from the environment by default.
