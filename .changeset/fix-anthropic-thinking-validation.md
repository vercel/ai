---
'@ai-sdk/anthropic': patch
'ai': patch
---

fix(anthropic): validate thinking block requirement and prevent silent reasoning drop

- Added pre-flight validation when thinking is enabled to ensure the last assistant message starts with a thinking block
- Improved warning messages when reasoning parts are dropped due to missing metadata
- Gated reasoning-start/reasoning-end behind sendReasoning to prevent ghost reasoning parts
