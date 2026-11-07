---
'@ai-sdk/xai': patch
---

feat(xai): add `safetyIdentifier` Responses provider option

Sends `safety_identifier` with Responses API requests so xAI can attribute a policy violation to one end user, and exposes the echoed value on `providerMetadata.xai.safetyIdentifier`.
