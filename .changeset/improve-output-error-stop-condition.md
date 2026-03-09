---
'ai': patch
---

Improved `NoOutputGeneratedError` message when using `output` with tools and a stop condition that causes the loop to exit while the model is still making tool calls. The error now explains that the model continued making tool calls until the stop condition was met without producing a text response, and suggests using `prepareStep` with `toolChoice: 'none'` on the final step to force text generation.
