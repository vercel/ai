---
'@ai-sdk/gateway': patch
---

Map AI Gateway `access_policy_denied` error responses (HTTP 403) to the new `GatewayAccessPolicyDeniedError` instead of `GatewayInternalServerError`. Use `GatewayAccessPolicyDeniedError.isInstance(error)` to tell an access policy denial from other 403 errors. When the response includes them, the error exposes the denying policy IDs (`policyIds`) and the models and providers the policies removed (`removedModels`, `removedProviders`).
