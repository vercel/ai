---
'@ai-sdk/harness-acp': patch
---

fix(harness-acp): cancel the ACP prompt, discard the cancelled prompt's remaining updates, and reject permission requests once the host aborts a turn, including when the abort arrives before the prompt is dispatched or while the initial host-tool catalog refresh is pending
