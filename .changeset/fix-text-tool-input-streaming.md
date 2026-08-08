---
'ai': patch
---

fix(ai/ui): show freeform text tool input during streaming instead of undefined

When using non-JSON tool inputs (e.g. OpenAI customTool with `format: { type: 'text' }`),
`tool-input-delta` chunks were parsed via `parsePartialJson` which returned `undefined` for
plain text. The tool `input` field stayed `undefined` throughout streaming and only appeared
on the final `tool-input-available` chunk.

Now falls back to the raw accumulated text when partial JSON parsing fails, so freeform
tool inputs are visible progressively during streaming.
