---
'ai': patch
---

fix: Parse structured output even when finishReason is 'tool-calls' if text content exists

When using custom tools with structured output (Output.object()), the final step may have
finishReason='tool-calls' even though valid JSON output is present. This fix attempts to
parse the output when an explicit output schema is provided and there's text content,
regardless of the finish reason.
