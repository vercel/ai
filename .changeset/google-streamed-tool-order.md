---
'@ai-sdk/google': patch
'@ai-sdk/google-vertex': patch
'ai': patch
'@ai-sdk/anthropic': patch
'@ai-sdk/amazon-bedrock': patch
---

Preserve the order of text and complete function calls in streamed Google responses, including standalone thought signatures on empty text or reasoning parts.

Keep provider metadata on empty text parts when converting results to response messages so it can be passed back in subsequent requests.

Omit foreign-provider empty signature text when replaying history through Anthropic or Bedrock, preserving Bedrock’s existing native reasoning-history handling.
