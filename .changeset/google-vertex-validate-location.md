---
'@ai-sdk/google-vertex': patch
---

Reject location values that cannot be a DNS label. The location is interpolated into the request host (`https://{location}-aiplatform.googleapis.com`), so a value such as `evil.example.com/#` rewrote the destination host instead of failing. Only a single DNS label is accepted now; use `baseURL` for custom endpoints.
