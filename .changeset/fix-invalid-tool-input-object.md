---
'ai': patch
---

fix(generate-text): wrap unparseable tool-call input in an object so it doesn't break the next provider step

`parseToolCall` previously stored the raw tool-call string as `input` when neither parsing nor repair succeeded. That string flowed through `to-response-messages.ts` and `convert-to-language-model-prompt.ts` into the next assistant message, and providers like Amazon Bedrock reject the request because `toolUse.input` must be a JSON object. The model never saw the `tool-error` and never had a chance to retry.

The unparseable input is now wrapped as `{ rawInvalidInput: toolCall.input }` so the conversation history stays valid for the next API call while the raw text is preserved for debugging.
