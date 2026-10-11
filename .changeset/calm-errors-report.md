---
'ai': patch
---

Call the UI message stream `onError` callback once for an invalid tool call. Previously it was called twice, first with the error object and then with its message string.
