---
'ai': patch
---

Fixed `pruneMessages` leaving orphaned `reasoning` / `reasoning-file` parts behind when `toolCalls` pruning removed the tool calls they preceded. A reasoning part is now also removed when every part after it, up to the next reasoning part or the end of the message, was pruned. This cuts wasted context tokens and avoids sending reasoning to providers that require it to be followed by its output.
