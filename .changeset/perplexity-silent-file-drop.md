---
'@ai-sdk/perplexity': patch
---

Fix file parts with unsupported media types being silently dropped from the prompt. Unsupported file media types now throw `UnsupportedFunctionalityError` like other providers, and PDFs passed with a top-level-only `application` media type are now detected from their bytes and sent as `file_url` parts instead of being discarded.
