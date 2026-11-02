---
'@ai-sdk/google': patch
'ai': patch
---

Preserve the order of text and complete function calls in streamed Google responses, including standalone thought signatures on empty text or reasoning parts.

Keep provider metadata on empty text parts when converting results to response messages so it can be passed back in subsequent requests.
