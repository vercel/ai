---
'ai': patch
---

Add native `prepareStep` compaction with automatic UI persistence. Returning a compaction result applies the replacement model history and carries its checkpoint forward; UI streams automatically record the replaced history boundary, and agent UI helpers restore the context and checkpoint on subsequent requests. The complete visible conversation stays in the normal UI message history. Conversion uses the latest applicable record and falls back when edits invalidate its covered prefix. Low-level record creation and `onCompactionApplied` remain available for custom integrations.
