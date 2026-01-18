---
'@ai-sdk/anthropic': patch
---

Fix JSON parsing crash when handling Anthropic web_fetch tool error results

When Anthropic's web_fetch tool returned an error result (e.g., url_not_allowed), 
the SDK would crash with "SyntaxError: '[object Object]' is not valid JSON" when 
preparing subsequent requests with the error in message history.

The issue occurred because the error value could be either a JSON string or an 
object, but the code only handled the string case by calling JSON.parse(). When 
an object was passed, it would be coerced to "[object Object]", causing a parse error.

The fix now:
- Checks if the error value is a string before calling JSON.parse()
- Handles object values directly 
- Gracefully handles malformed JSON by extracting errorCode or defaulting to 'unknown'
- Ensures tool error results are preserved and don't crash the agent flow

Fixes #11856
