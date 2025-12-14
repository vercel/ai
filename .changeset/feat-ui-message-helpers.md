---
'ai': patch
---

feat(ui): add UIMessage part helper functions

Add convenience functions to extract and aggregate UIMessage parts:

- `getTextParts(message)` - get all text parts as array
- `getTextContent(message)` - get joined text string
- `getReasoningParts(message)` - get all reasoning parts as array
- `getReasoningContent(message)` - get joined reasoning string
- `isReasoningStreaming(message)` - check if reasoning is currently streaming
- `isTextStreaming(message)` - check if text is currently streaming
