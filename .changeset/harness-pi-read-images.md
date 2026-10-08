---
'@ai-sdk/harness-pi': patch
---

fix(harness-pi): return images from the read tool as image blocks

The `read` tool decoded every file as UTF-8, so the model received an image as unreadable text. The tool now runs Pi's own `createReadToolDefinition` over the sandbox: PNG, JPEG, GIF, WebP and BMP files come back as image blocks that Pi resizes, and text reads keep Pi's truncation and paging notices. The tool still takes `file_path`, and path mapping and `fileToolPathPolicy` apply as before.
