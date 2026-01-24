---
'@ai-sdk/xai': patch
---

fix(xai): make usage nullable in responses schema for streaming compatibility

xAI sends `usage: null` in early streaming events (`response.created`, `response.in_progress`) because token counts aren't available until the stream completes. This change makes the `usage` field nullish in `xaiResponsesResponseSchema` to accept these values without validation errors.
