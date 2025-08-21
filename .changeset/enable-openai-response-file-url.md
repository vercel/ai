---
'@ai-sdk/openai': patch
---

Support Responses API input_file file_url passthrough for PDFs.

This adds:

- file_url variant to OpenAIResponses user content
- PDF URL mapping to input_file with file_url in Responses converter
- PDF URL support in supportedUrls to avoid auto-download
