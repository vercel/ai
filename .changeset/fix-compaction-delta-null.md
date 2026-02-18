---
'@ai-sdk/anthropic': patch
---

fix(anthropic): allow null content in compaction/compaction_delta schemas. Anthropic API can send compaction_delta events with content: null (e.g., the initial frame before the compaction summary text), which previously caused Zod validation failure.
