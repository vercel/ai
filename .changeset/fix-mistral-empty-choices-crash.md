---
'@ai-sdk/mistral': patch
---

Fix crash when streaming from Azure AI Services endpoints that inject content-filter chunks with an empty `choices` array. The streaming transform now skips chunks where `choices[0]` is absent instead of throwing `TypeError: Cannot read properties of undefined (reading 'delta')`.
