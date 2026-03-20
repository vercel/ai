---
'@ai-sdk/openai-compatible': patch
---

fix(openai-compatible): support chat completion content arrays with thinking parts

OpenAI-compatible chat parsing now accepts `content` as either a string or an array of content parts for both non-stream and stream responses. When `thinking` parts are present, their text is mapped to reasoning output while text parts continue to stream as normal text deltas.
