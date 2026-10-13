---
'@ai-sdk/harness': patch
---

fix (harness): stop leaking a resumed sandbox session when hashing its bootstrap recipe fails. On the resumed-session path, `hashHarnessBootstrap` ran before the `try` block covering `applyBootstrapRecipe` and its cleanup, so a failure there skipped `cleanupAfterStartFailure` and left the resumed sandbox running.
