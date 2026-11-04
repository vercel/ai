---
name: add-function-examples
description: Guide for adding new AI function examples, for testing specific features against the actual provider APIs.
metadata:
  internal: true
---

## Adding Function Examples

Review the changes in the current branch, and identify new or modified behavior that would benefit from a reusable example in the `examples/ai-functions` directory. These examples are used for testing specific features against the actual provider APIs, and can also serve as documentation for users.

For bug reproductions, follow the [bug-fix workflow in AGENTS.md](../../AGENTS.md#bug-fixes): reproduce the failure end-to-end with a temporary script outside the checkout, then rerun it to verify the fix. Build and use the checkout's local packages for both runs. Include the complete runnable script, commands, and observed before/after results in the PR description's **End-to-End Verification** section, following `.github/pull_request_template.md`. Do not commit reproduction-only files; regression tests and reusable examples (including for fixed behavior) still belong in the repository.

Determine for which kind of model and top-level function the example should be added. For a language model, the example should be added in two variants, one for `generateText` and one for `streamText`. For any other models kinds, add the example for the relevant top-level function (e.g. `generateImage`, `generateSpeech`).

After creating the example, run `pnpm type-check:full`; fix any errors encountered.
