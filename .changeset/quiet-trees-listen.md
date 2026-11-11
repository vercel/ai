---
'@ai-sdk/workflow': patch
---

fix(workflow): End the final step's telemetry when streaming stops on a client-side tool, preserving the step span and its model call in the agent trace.
