---
'ai': patch
---

feat(ai): add `types` option to `smoothStream` to choose which part types are smoothed. `smoothStream({ types: ['text'] })` smooths text only and passes reasoning through immediately, so text no longer waits behind reasoning that the UI does not display. The default `['text', 'reasoning']` keeps the current behavior.
