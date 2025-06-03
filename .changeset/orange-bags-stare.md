---
'ai': patch
---

### fix use with Google APIs + `.literal()`

Before, when using a zod v4 schema to interact with Google's models, requests would fail due to schema errors. The problem was fixed in zod@3.25.49.

pull request: https://github.com/vercel/ai/pull/6609