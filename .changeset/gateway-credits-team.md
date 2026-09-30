---
'@ai-sdk/gateway': patch
---

fix(gateway): scope `getCredits()` to `teamIdOrSlug`

The credits endpoint reads the team from the `teamId` / `slug` query parameter rather than the `x-vercel-ai-gateway-team` header. `getCredits()` now forwards the configured team as a query parameter, so credentials that can access multiple teams (such as Vercel access tokens) are no longer rejected with an authentication error.
