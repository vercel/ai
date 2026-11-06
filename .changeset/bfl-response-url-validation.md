---
'@ai-sdk/black-forest-labs': patch
'@ai-sdk/provider-utils': patch
---

Validate response-supplied Black Forest Labs polling and image URLs, including redirects, to block requests to private destinations outside the configured provider origin. Preserve self-hosted endpoints and withhold credentials from foreign origins and cross-origin redirects.
