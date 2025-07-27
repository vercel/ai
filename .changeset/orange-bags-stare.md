---
'ai': patch
---

### Fix use with Google APIs + zod v4's `.literal()` schema

Before [zod@3.25.49](https://github.com/colinhacks/zod/releases/tag/v3.25.49), requests to Google's APIs failed due to a missing `type` in the provided schema. The problem has been resolved for the `ai` SDK by bumping our `zod` peer dependencies to `^3.25.49`.

pull request: https://github.com/vercel/ai/pull/6609
