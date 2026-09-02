---
"@ai-sdk/angular": patch
---

fix(angular): don't let `Completion.handleSubmit` register `input` as a reactive dependency

`handleSubmit` read the `input` signal directly. Calling it from inside an `effect` or `computed` (for example, an auto-send effect) would subscribe that reactive context to `input`, so it re-ran on every keystroke. It now reads the value with `untracked`. Nothing changes for the normal form-submit path.
