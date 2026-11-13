---
'@ai-sdk/google': patch
---

Fix Google Interactions ignoring top-level `reasoning` in generation and streaming calls. Map reasoning to model-supported thinking levels, including Hydrogen's `xhigh`, preserve explicit `thinkingLevel` overrides and API defaults, and warn when reasoning is unsupported.
