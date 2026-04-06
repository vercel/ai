---
'@ai-sdk/amazon-bedrock': patch
---

fix(amazon-bedrock): do not merge AWS_SESSION_TOKEN from env with explicit access keys

When `accessKeyId` and `secretAccessKey` are both passed as options, session credentials now use only `options.sessionToken` or omit the token — avoiding workload tokens (e.g. EKS IRSA) invalidating SigV4 for static IAM user keys.

Docs: remove incorrect guidance that `sessionToken: undefined` blocks `AWS_SESSION_TOKEN`; describe static keys, env fallback, and `credentialProvider` workaround for older versions.
