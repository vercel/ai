---
'@ai-sdk/openai': patch
---

fix(openai/responses): support file-url parts in tool output content

file-url content parts returned from toModelOutput were silently dropped
with an "unsupported tool content part type" warning. They are now correctly
forwarded to the Responses API as { type: "input_file", file_url: "..." },
matching the existing behaviour for user message file parts.
