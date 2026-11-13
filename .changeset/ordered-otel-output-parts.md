---
'@ai-sdk/otel': patch
---

fix(otel): record `gen_ai.output.messages` parts in the order the model produced them

Output messages previously grouped parts by type (reasoning, then all text joined into one part, then tool calls), so they did not match the same assistant message in the next step's `gen_ai.input.messages`. Output parts now follow the content order, text blocks are no longer merged, and file, reasoning file, custom, tool error, and tool approval parts are emitted on both the output and input side. Adds `formatOutputContent` and deprecates `formatOutputMessages`.
