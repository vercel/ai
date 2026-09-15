---
'@ai-sdk/amazon-bedrock': patch
---

fix(amazon-bedrock): normalize Mistral tool call IDs by hashing the full ID instead of truncating to the first 9 characters. Truncation kept only the constant `tooluse` prefix plus ~2 variable characters, so distinct Bedrock tool call IDs collided to the same normalized ID and Bedrock rejected the request with `ValidationException: ... contain duplicate Ids`. The hash uses the full 9-character space deterministically and always produces exactly 9 alphanumeric characters.
