---
'ai': patch
---

Extract common callback structure from GenerateTextOnFinishCallback, StreamTextOnFinishCallback, and ToolLoopAgentOnFinishCallback into a shared TextOnFinishEvent base type. This prepares the codebase for adding output/outputError support to callbacks.
