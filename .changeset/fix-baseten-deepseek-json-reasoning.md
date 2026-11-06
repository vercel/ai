---
'@ai-sdk/baseten': patch
---

Avoid empty structured-output answers from Baseten's DeepSeek V4 Pro 0813 when reasoning is enabled. Inject JSON instructions and the schema into the prompt instead of enabling the broken JSON mode, preserving reasoning and SDK output validation. Emit a compatibility warning that the server is not enforcing the schema.
