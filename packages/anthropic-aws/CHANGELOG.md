# @ai-sdk/anthropic-aws

## 0.1.1

### Patch Changes

- Updated dependencies [c6e1d1a]
  - @ai-sdk/provider-utils@3.0.29
  - @ai-sdk/anthropic@2.0.86

## 0.1.0

### Minor Changes

- 4cb71d0: feat(anthropic-aws): add Claude Platform on AWS provider to the v5 release line

  Backports the `@ai-sdk/anthropic-aws` provider to AI SDK v5, adapted to the V2 provider specification (`LanguageModelV2` / `ProviderV2`). The provider wraps the Anthropic Messages API hosted on AWS, authenticated with AWS SigV4 or an AWS-provisioned API key.
