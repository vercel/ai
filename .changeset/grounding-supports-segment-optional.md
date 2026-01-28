---
'@ai-sdk/google': patch
---

fix (provider/google): make `segment` optional in `groundingSupports` schema

The Google Generative AI API sometimes returns grounding supports without a `segment` field. This change makes the `segment` field optional to handle these responses correctly.
