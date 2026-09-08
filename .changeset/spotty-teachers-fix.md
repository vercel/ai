---
'@ai-sdk/amazon-bedrock': patch
---

fix(bedrock-mantle): normalize non-Responses-shaped stream error frames

Bedrock's OpenAI-Responses-compatible endpoints emit terminal error frames the
Responses stream schema rejects: typeless AWS error objects
(`{"message": "..."}`) and `error` events with a stringified JSON payload or a
null `code`. Those frames previously surfaced as `AI_TypeValidationError`. The
mantle provider now rewrites them into well-formed `error` events, so callers
see the provider's actual error message.
