---
'ai': patch
'@ai-sdk/provider': patch
'@ai-sdk/google': patch
---

fix(ai): retry unclassified empty image results, retain completed attempt accounting and provider metadata, allow providers to classify terminal empty results, and avoid retrying blocked Google Gemini image prompts
