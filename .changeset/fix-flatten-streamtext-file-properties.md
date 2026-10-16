---
"@ai-sdk/codemod": patch
---

Stop `v5/flatten-streamtext-file-properties` from rewriting nested `file.mediaType` and `file.data`. `streamText` file parts keep those fields on `file`, so the codemod is now a no-op and is no longer part of `upgrade`.

Reported by @brennanbutler01 in https://github.com/vercel/ai/issues/23310.
