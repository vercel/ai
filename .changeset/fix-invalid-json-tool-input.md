---
"ai": patch
---

fix(ai): wrap non-JSON tool inputs so persisted messages stay API-valid

When tool arguments could not be parsed as JSON, the SDK kept the raw string as `input`, which broke follow-up requests that reuse `response.messages`. Those cases now use `{ __invalidObject: "<raw>" }` as the stored input.
