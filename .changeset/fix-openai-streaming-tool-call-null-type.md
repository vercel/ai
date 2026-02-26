---
'@ai-sdk/openai': patch
---

fix(openai): allow null/undefined type in streaming tool call deltas

Azure AI Foundry and Mistral deployed on Azure omit the `type` field in
streaming tool_calls deltas. The chat stream parser now accepts a missing
`type` field (treating it as `"function"`) instead of throwing
`InvalidResponseDataError: Expected 'function' type.`

Fixes #12770
