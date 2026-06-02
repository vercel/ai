---
'ai': patch
---

fix(ai/ui): avoid crash in `convertToModelMessages` when an `output-denied` tool part has no `approval`

`convertToModelMessages` read `toolPart.approval.reason` unguarded for tool parts in the `output-denied` state. A tool part can legitimately be in `output-denied` without an `approval` object (e.g. denied tool history rehydrated from storage), which threw `TypeError: Cannot read properties of undefined (reading 'reason')`. Use optional chaining so it falls back to the default denial message instead of crashing.
