---
'@ai-sdk/google-vertex': patch
---

fix(google-vertex): use correct hostname for Anthropic multi-region endpoints (`us`, `eu`)

Previously `createVertexAnthropic` built the base URL as
`https://${location}-aiplatform.googleapis.com` for any non-`global` location.
This produced 404s for `location: 'us'` and `location: 'eu'`, because Vertex's
multi-region endpoints are served from dedicated hostnames
(`aiplatform.us.rep.googleapis.com` and `aiplatform.eu.rep.googleapis.com`).

The provider now mirrors the upstream `@anthropic-ai/vertex-sdk` logic and
resolves the host via a `switch(location)`, unblocking Claude models that are
only available on multi-region endpoints (e.g. EU-multi-region-only models).
