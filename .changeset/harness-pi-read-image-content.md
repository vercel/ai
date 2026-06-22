---
"@ai-sdk/harness-pi": patch
---

Return image content from the Pi `read` tool. Image files (png, jpeg, gif, webp) are now detected by magic bytes and sent to the model as `image` content parts instead of being decoded as UTF-8 text, so vision-capable models can actually see images read from the sandbox. Images whose base64 payload exceeds the inline size limit fall back to a text note.
