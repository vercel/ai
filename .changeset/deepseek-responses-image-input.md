---
'@ai-sdk/deepseek': patch
---

feat(provider/deepseek): support image input on the Responses API. Image parts in user messages are sent as `input_image` content parts instead of being dropped with a warning, so `deepSeek.responses('deepseek-v4-flash-vision-exp')` accepts image URLs, image bytes and provider references from `deepSeek.files()` just like the Chat Completions models do.
