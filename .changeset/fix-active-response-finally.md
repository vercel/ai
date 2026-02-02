---
'ai': patch
---

fix(ui): prevent TypeError in onFinish when activeResponse is undefined

Use local variable capture pattern in makeRequest() to safely access activeResponse in the finally block. This prevents "Cannot read properties of undefined (reading 'state')" errors when:

- An error is thrown before activeResponse is assigned
- Concurrent makeRequest calls overwrite this.activeResponse

Thanks to @codybrouwers for identifying the root cause and solution.
