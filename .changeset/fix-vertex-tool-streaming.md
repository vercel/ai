---
'@ai-sdk/anthropic': patch
'@ai-sdk/google-vertex': patch
---

Fix: Handle partial JSON chunks in tool streaming for code execution tools

Added a check to ensure that the first delta for code execution tools (bash_code_execution and text_editor_code_execution) starts with '{' before attempting to transform it. This prevents malformed JSON when the first chunk is partial or doesn't include a complete JSON object start.
