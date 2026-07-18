---
'@ai-sdk/harness-claude-code': patch
---

feat (harness-claude-code): support inline images in user prompts. File parts with image media types (and deprecated image parts) are forwarded to the Claude Agent SDK as base64 image content blocks instead of throwing HarnessCapabilityUnsupportedError.
