---
'ai': patch
---

fix(ai): parse `generateText` output when the last step is text-only, even if `finishReason` is not `stop`

`generateText` previously only parsed `Output.object` / `Output.array` / `Output.choice` / `Output.json` / `Output.text` when `lastStep.finishReason === 'stop'`. Some providers report `tool-calls` as the finish reason for text-only final steps — most notably Cerebras `zai-glm-4.7` after the agent has already executed tools — which buried a perfectly parseable structured response behind `NoOutputGeneratedError`.

Output is now also parsed when the last step has no tool calls and produced non-empty text. Steps that actually contain tool calls (i.e. the agent loop should have continued but a stop condition fired first) still throw `NoOutputGeneratedError` exactly as before.
