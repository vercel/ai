---
'@ai-sdk/devtools': patch
---

Avoid using `NODE_ENV` in devtools lib code to make devtools bin work with `bunx --bun devtools command for users that have `NODE_ENV` set to development in a .env file
