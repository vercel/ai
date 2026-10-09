---
'@ai-sdk/provider': patch
'ai': patch
---

Add an optional shared citation representation to generated text and text-end stream events, separate from retrieved sources. Preserve citations in core result content and UI message text parts, including validation and persistence, without changing content or stream event discriminants.
