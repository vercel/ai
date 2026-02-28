---
'@ai-sdk/anthropic': patch
'ai': patch
---

fix(anthropic, ai): preserve error_code through UI message flow for provider tools

**Issue 1 (fallback)**: When provider-executed tools (web_fetch, code_execution) return errors without
an explicit error code, the fallback was 'unknown' which is not a valid Anthropic error code. Changed
to 'unavailable'.

**Issue 2 (preservation)**: The original error_code (like 'url_not_allowed') was lost when stored in
UI state - it became a plain errorText string, losing the structured error. On subsequent requests,
the Anthropic converter tried to parse errorText but failed, falling back to 'unavailable'.

The fix preserves errorCode through the entire UI message flow:

1. Extract errorCode from tool-error objects in stream-text.ts
2. Add errorCode to tool-output-error UI chunks and UIToolInvocation types
3. Pass errorCode through process-ui-message-stream.ts
4. Include errorCode in createToolModelOutput for error-json type
5. Anthropic converter now receives the preserved errorCode

This ensures that specific error codes like 'url_not_allowed' are properly returned to the Anthropic
API on subsequent requests, instead of falling back to 'unavailable'.

Fixes #12203
