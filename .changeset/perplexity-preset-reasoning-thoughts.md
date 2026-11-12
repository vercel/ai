---
'@ai-sdk/perplexity': patch
---

Stream Agent API reasoning thoughts (such as "Searching the web..." on search and fetch events) as reasoning even when no `response.reasoning.started` event precedes them, which is how the presets stream. Consecutive thoughts are separated by newlines, and open reasoning ends before text or client tool calls start.
