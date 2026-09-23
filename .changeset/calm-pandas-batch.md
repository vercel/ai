---
'ai': patch
'@ai-sdk/google': patch
'@ai-sdk/provider-utils': patch
---

Fix Google `embedMany` calls with more than 100 values by keeping per-value multimodal content aligned across automatic batches, including text-only entries. Validate content length before sending requests and validate each batch's provider options after middleware transforms them.
