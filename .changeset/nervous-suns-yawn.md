---
'@ai-sdk/google': patch
---

Fix JSON serialization of tool results in multi-step calls

Fixed a critical bug where tool results with JSON values were not being properly serialized to strings before being sent to the Google Generative AI API. This caused `gemini-2.5-flash-lite` to fail to generate text in Step 2 of the tool calling loop when using `generateText` with `tools` and `maxSteps`.

The API requires the `functionResponse.response.content` field to be a string. Previously, JSON objects were being passed as-is, which the model couldn't process correctly, resulting in empty text output with `finishReason='stop'`.
