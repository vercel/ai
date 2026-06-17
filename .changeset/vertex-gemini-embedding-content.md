---
'@ai-sdk/google-vertex': patch
---

Route `gemini-embedding-2` / `gemini-embedding-2-preview` to the `:embedContent` endpoint, which is the only one those models support (`:predict` returns 400 FAILED_PRECONDITION)
