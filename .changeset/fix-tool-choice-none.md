---
'@ai-sdk/anthropic': patch
---

fix(anthropic): keep tools array when toolChoice is 'none'. Previously, toolChoice 'none' stripped both tools and tool_choice from the request, causing empty responses with tool_use history.
