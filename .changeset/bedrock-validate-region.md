---
'@ai-sdk/amazon-bedrock': patch
---

Reject AWS region values that cannot be a DNS label. The region is interpolated into the request host (`https://bedrock-runtime.{region}.{dnsSuffix}`), so a value such as `evil.example.com/#` rewrote the destination host instead of failing. Only a single DNS label is accepted now; use `baseURL`, `AWS_ENDPOINT_URL`, or `AWS_ENDPOINT_URL_BEDROCK_RUNTIME` for custom endpoints.
