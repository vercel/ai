---
'@ai-sdk/anthropic': patch
---

Require the request-level `allowInlineToolDefinitions` opt-in for by-value system-message tool additions. This prevents client UI history from introducing undeclared provider tools or replacing server-configured tool restrictions with default or automatic tool choice. Enable the option only for server-controlled messages; declared tools and changes by reference remain supported.
