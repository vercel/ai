---
'@ai-sdk/klingai': patch
---

feat(provider/klingai): support single API key authentication

Kling AI now issues a single API key that is sent as a bearer token. Set it via
the `apiKey` provider setting or the `KLINGAI_API_KEY` environment variable. The
legacy `accessKey` / `secretKey` pair keeps working; when it is used the
provider continues to sign a short-lived JWT per request.
