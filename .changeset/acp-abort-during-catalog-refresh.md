---
'@ai-sdk/harness-acp': patch
---

fix(harness-acp): cancel the ACP prompt and reject permission requests once the host aborts a turn, including when the abort arrives before the prompt is dispatched or while the initial host-tool catalog refresh is pending
