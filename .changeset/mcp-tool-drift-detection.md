---
'ai': patch
---

Add `fingerprintTools` and `detectToolDrift` to detect MCP tool-definition drift ("rug pull"). Pin a tool set's server-controlled fields (string description, input schema, title) at trust time with `fingerprintTools`, then diff later fetches with `detectToolDrift` to catch injected descriptions or widened schemas before passing tools to the model. Baseline storage and the drift response remain the app's responsibility.
