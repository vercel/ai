---
'ai': patch
---

Fix TypeError in onFinish when activeResponse is undefined

Fixed a bug where `this.activeResponse` could be undefined in the finally block of `makeRequest`, causing a TypeError when calling `onFinish`. This happened when:

1. An error was thrown before `this.activeResponse` was assigned
2. A concurrent `makeRequest` call overwrote `this.activeResponse`

The fix uses a local variable to capture `activeResponse` at the start of the try block, ensuring it's available in the finally block regardless of concurrent operations.

Fixes #8477
