---
'@ai-sdk/harness': patch
---

feat (harness): consent-gated runtime executable installation. Adapters can declare how their runtime's executable is installed (`HarnessV1.installation`); when a session's environment is missing it, the framework resolves consent through the new `onInstallRequest` agent setting — a boolean to assume or refuse consent, or a function to decide per request — before the adapter may install. By default, installs into provider-owned (disposable) sandboxes are permitted, while installs into a user-owned environment (sandbox sessions declaring `environmentOwner: 'user'`) are denied and fail with the new `HarnessExecutableMissingError`, which carries the adapter's install command so the failure is actionable.
