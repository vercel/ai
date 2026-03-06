---
'@ai-sdk/provider-utils': patch
---

fix(provider-utils): RFC 9110 compliant User-Agent header format

The generated User-Agent header contained invalid product tokens per
RFC 9110 §10.1.5. `ai-sdk/provider-utils/4.0.15` has a `/` in the
product name, and `runtime/bun/1.3.9` has a nested `/` in the
product-version. This caused Azure OpenAI to reject requests with 400.

Now produces RFC-compliant tokens like `ai-sdk-provider-utils/4.0.15`
and `runtime-bun/1.3.9`.
