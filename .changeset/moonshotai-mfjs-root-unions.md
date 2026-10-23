---
'@ai-sdk/moonshotai': patch
---

fix(moonshotai): accept root unions of objects in tool and response schemas

A root `anyOf`/`oneOf` of object schemas no longer throws, and a root `type: "object"` beside `anyOf` is no longer moved into the branches (Moonshot rejects a root without `type: "object"`).
