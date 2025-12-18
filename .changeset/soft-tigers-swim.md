---
'@ai-sdk/openai': patch
---

fix openai responses input: process all provider tool outputs (shell/apply_patch) so parallel tool results aren’t dropped and apply_patch outputs are forwarded.
