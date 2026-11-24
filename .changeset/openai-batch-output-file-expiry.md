---
'@ai-sdk/openai': patch
---

feat(provider/openai): add an `outputFileExpiresAfter` batch provider option that sets `output_expires_after` on batch creation, and expose the batch output and error file IDs on batch status as `providerMetadata.openai.outputFileId` / `errorFileId`
