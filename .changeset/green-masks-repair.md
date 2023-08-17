---
'ai': patch
---

Add experimental_StreamData and new opt-in wire protocol to enable streaming additional data. See https://github.com/vercel/ai/pull/425.

Changes `onCompletion` back to run every completion, including recursive function calls. Adds an `onFinish` callback that runs once everything has streamed.
