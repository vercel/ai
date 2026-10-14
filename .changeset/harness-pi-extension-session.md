---
'@ai-sdk/harness-pi': patch
---

feat(harness-pi): pass the harness session to extension factories

Each `extensionFactories` entry now receives a second argument, a `PiHarnessExtensionSession` with the restricted `sandboxSession`, the `sessionWorkDir` and an `instructions()` getter for the current turn's instructions. An extension can now run work against the session's sandbox with the session's instructions, such as a tool that delegates to a child Pi session. Existing `(pi) => void` factories keep working unchanged.
