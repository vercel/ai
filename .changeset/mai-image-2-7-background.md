---
'@ai-sdk/azure': patch
---

Add the MAI-Image-2.7 and MAI-Image-2.7-Flash image models and the `background` provider option (`'transparent'` or `'opaque'`) for MAI image generations and edits. On the MAI image API, `background: 'auto'` is not sent and produces a warning; OpenAI image deployments keep accepting it.
