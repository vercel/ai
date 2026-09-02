---
'@ai-sdk/openai': patch
'@ai-sdk/xai': patch
'@ai-sdk/google': patch
---

feat(batch): surface the uploaded input file on the batch start result (`providerMetadata.<provider>.inputFileId` / `inputFileExpiresAt`) and accept an `inputFileExpiresAfter` provider option on the OpenAI and xAI batch input file upload
