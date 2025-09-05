---
'@ai-sdk/anthropic': patch
---

fix(anthropic): separate tool_result from user content to fix Claude API error

Modified groupIntoBlocks to ensure tool messages create separate user blocks, preventing Claude API error: 'tool_use ids were found without tool_result blocks immediately after'. Fixes #8318.
