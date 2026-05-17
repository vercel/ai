---
"@ai-sdk/xai": patch
"@ai-sdk/deepseek": patch
"@ai-sdk/groq": patch
"@ai-sdk/mistral": patch
---

fix(xai, deepseek, groq, mistral): only send null content for assistant messages with tool calls

Apply the same fix as #14950 (openai, openai-compatible) to four additional OpenAI-compatible providers. When an assistant message contains only `tool-call` parts (no text), emit `content: null` so providers that route to Bedrock or strictly follow the OpenAI spec stop rejecting the request with `ValidationException: messages: text content blocks must be non-empty`. When the message has no tool calls, preserve the original string (including empty string) so we do not regress the OpenAI-spec rule "content is required unless tool_calls or function_call is specified".

Closes #14612.
