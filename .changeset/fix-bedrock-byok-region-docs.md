---
'@ai-sdk/gateway': patch
---

docs(gateway): add required `region` field to Bedrock BYOK credential examples

Updated documentation and JSDoc comments to include the `region` field in Amazon Bedrock BYOK credential examples. The `region` field is required for Bedrock to construct the correct endpoint URL (`https://bedrock-runtime.{region}.amazonaws.com`).

Changes:
- Updated BYOK example in AI Gateway documentation to include `region: 'us-east-1'` for Bedrock credentials
- Added explicit note in gateway-provider-options.ts that `region` is required for Amazon Bedrock
- Added new example file `request-byok-bedrock.ts` demonstrating proper Bedrock BYOK configuration

This addresses issue #14096 where users experienced `getaddrinfo ENOTFOUND bedrock-runtime..amazonaws.com` errors due to missing region in BYOK credentials.
