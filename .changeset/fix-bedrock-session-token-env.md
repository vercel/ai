---
'@ai-sdk/amazon-bedrock': patch
---

fix(amazon-bedrock): do not inherit AWS_SESSION_TOKEN from env when explicit accessKeyId/secretAccessKey are provided

When both `accessKeyId` and `secretAccessKey` are passed as explicit options, the session token is now sourced only from `options.sessionToken`. Previously, `loadOptionalSetting` would fall back to `process.env.AWS_SESSION_TOKEN`, which on hosts with workload identity (EKS IRSA, ECS task role, Lambda) belongs to a different principal, causing "The security token included in the request is invalid" errors.
