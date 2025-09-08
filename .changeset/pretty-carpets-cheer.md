---
'@ai-sdk/anthropic': patch
---

fix(anthropic): reorder tool_result parts to front of combined user messages

Reorders tool_result content to appear before user text within combined user messages, ensuring Claude API validation requirements are met while preserving the intentional message combining behavior that prevents role alternation errors. Fixes #8318.
