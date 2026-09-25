# Harness requirements

This documents high-level requirements for implementing a harness adapter for the `HarnessAgent` layer.

## Harness capability lists

Follow these lists in identifying which harness capabilities to cover when implementing a new harness.

### Must have

If the adapter cannot support any one of these, the underlying SDK or CLI is not feasible to use with `HarnessAgent`.

- Emit observable bash/shell tool calls.
- Emit an event indicating when a file is created, modified, or deleted.
- Support custom tools.
- Support custom tool approvals.
- Support custom instructions.
- Allow model selection.
- Support skills.
- Support resuming a session that was started in another process, including if the sandbox was stopped in between.

### Should have

Implement these where possible, and document each unsupported capability as a notable gap in the harness documentation.

- Emit observable tool calls for all native tools.
- Support built-in tool filtering.
- Support built-in tool approvals via `permissionMode`.
- Support structured output.
- Re-apply `prepareCall`-derived settings when they change between turns.

### Nice to have

Include these when possible, but unsupported capabilities do not need to be documented.

- Support mid-turn steering.

## Example coverage

Other than regular test coverage, every harness adapter must be covered with runnable examples in `examples/ai-functions/src/harness-agent` and interactive Next.js app examples in `examples/harness-e2e-next`.

The sections below outline what examples you must provide for every harness.

### `examples/ai-functions/src/harness-agent`

- Runnable examples that can be executed autonomously and either PASS or FAIL.
- While they can be individually executed via `pnpm tsx` like other (non-harness) examples in `examples/ai-functions`, for the harness examples specifically using the `./tools/run-harness-agent-examples.sh` script is recommended as it allows running them in bulk and provides a comprehensive summary at the end.
- When adding a harness, you must add all example files for that harness that the other already existing harness adapters include.
  1. Check via e.g. `ls examples/ai-functions/src/harness-agent/claude-code` and `ls examples/ai-functions/src/harness-agent/codex`.
  2. Copy over the files that are present in both folders from one of them, into the new folder for the harness adapter you're implementing.
  3. Make sure the file contents are identical, except for of course the specific harness adapter import and usage, and occasional harness-specific nuances (e.g. whether or not to configure open ports in the sandbox used).
- Important: You must include all example files per the above, _even if_ you know some of them will fail, e.g. because the harness adapter has a known limitation, per the ["Should have"](#should-have) or ["Nice to have"](#nice-to-have) sections above.

### `examples/harness-e2e-next`

- Interactive examples that can be used as part of the Next.js app. They are more manual and more elaborate to test, however they are crucial to cover aspects such as cross-process session resumption and workflow usage of `HarnessAgent`.
- To test these example pages, run `pnpm --filter harness-e2e-next dev` to start the dev server, then visit `localhost:3000` in the browser.
- When adding a harness, you must add all example pages for that harness that the other already existing harness adapters include. Each example consists of an agent definition file in `examples/harness-e2e-next/agent/harness/<harness-id>/`, an API route in `examples/harness-e2e-next/app/api/harness/<harness-id>`, and a page route in `examples/harness-e2e-next/app/harness/<harness-id>`.
  1. Look into one of the harness folders in each of the three locations (e.g. `claude-code` or `codex`).
  2. Copy over the files that are present, into the new folders for the harness adapter you're implementing.
  3. Make sure the file contents are identical, except for of course the specific harness adapter import and usage, and occasional harness-specific nuances (e.g. whether or not to configure open ports in the sandbox used).
- Important: You must include all example routes per the above. All of them must be generally usable.
