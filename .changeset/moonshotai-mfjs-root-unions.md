---
'@ai-sdk/moonshotai': patch
---

fix(moonshotai): accept root unions of objects (including local `$ref` branches) in tool and response schemas, and keep a root `type: "object"` beside `anyOf`
