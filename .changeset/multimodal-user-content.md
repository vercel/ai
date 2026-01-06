---
'@ai-sdk/langchain': patch
'@example/next-langchain': patch
---

fix(langchain): add multimodal support to convertUserContent

The `convertUserContent` function now properly handles image and file parts in addition to text parts.
Previously, only text content was extracted from user messages - now images and files are converted to
LangChain's multimodal content format with support for base64 data and binary data.

Added two new examples:

- "Vision Input" (`/multimodal`) - Send images to a vision model for analysis, with pre-loaded sample images converted to base64
- "Image Generation" (`/image-generation`) - Generate images as output using the updated adapter
