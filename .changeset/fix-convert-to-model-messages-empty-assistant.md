---
'ai': patch
---

Fix: `convertToModelMessages` no longer emits an empty assistant message when a block contains only unknown data parts (e.g. a data part before `step-start` with no `convertDataPart` provided)
