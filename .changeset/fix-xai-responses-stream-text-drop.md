---
'@ai-sdk/xai': patch
---

fix(xai): emit final text from response.output_item.done when no streaming deltas were received

Previously, text in `response.output_item.done` was silently dropped when the
content block already existed (created by a prior `response.output_item.added`
event). This caused truncated output — including missing end markers — for
long responses that arrive without `response.output_text.delta` events.

The fix tracks whether a content block received streaming delta events. Text
from `response.output_item.done` is now emitted only when no delta events
preceded it, preventing both the drop and any duplicate emission.
