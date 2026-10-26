---
"@ai-sdk/anthropic": patch
---

feat(anthropic): support workload identity federation

Without an API key or auth token, the provider now exchanges the identity token from the Anthropic workload identity federation environment variables (`ANTHROPIC_FEDERATION_RULE_ID`, `ANTHROPIC_ORGANIZATION_ID`, `ANTHROPIC_IDENTITY_TOKEN_FILE`, …) for a short-lived access token and refreshes it. `authToken` also accepts a function that resolves the token before each request. Requests authenticated with these OAuth access tokens send the `oauth-2025-04-20` beta header.
