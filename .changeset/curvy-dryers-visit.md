---
'@ai-sdk/openai': patch
---

fix(provider/openai): correctly handle multi-summary reasoning round-tripping in the Responses API. Two related issues are fixed: (1) the input builder now deduplicates reasoning items across consecutive assistant messages that share an `itemId`, eliminating `Duplicate item found with id rs_…` errors when persisted history splits one logical turn across multiple rows; (2) the streaming code now emits `reasoning-end` for every summary part of a reasoning item at `output_item.done` time, so each UI part carries the canonical final `encrypted_content` rather than only the last summary part — making persisted reasoning robust to downstream filtering, reordering, and partial save/restore.
