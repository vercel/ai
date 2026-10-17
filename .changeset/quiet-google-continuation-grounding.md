---
'@ai-sdk/google': patch
'@ai-sdk/google-vertex': patch
---

Preserve grounding metadata from each automatically continued Google response in `groundingMetadataPerRequest`. Previously, a later response without grounding could leave earlier Search queries absent from the final provider metadata even though their sources were returned. The new array preserves request order and includes `null` for requests without grounding.
