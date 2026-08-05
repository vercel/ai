---
name: update-harness-dependencies
description: Update the primary SDK dependencies of harness packages. Use when asked to update the harness SDKs or harness adapter dependencies.
metadata:
  internal: true
---

## Update the harness packages

The harness adapters are all the `packages/harness-*` packages. They each rely on one or more third-party packages for the respective harness's primary SDK. It is crucial to keep those dependencies up to date.

Below you find the instructions on how to update those packages to their latest versions, while adhering to the minimum release age defined in `pnpm-workspace.yaml`.

### Update the harness dependency packages

Run the following commands to update each harness's primary SDK packages.

- For bridge harnesses (e.g. Claude Code), this will update the packages in `devDependencies`, while the actual package versions used as `dependencies` are only relevant to the harness's bridge itself.
- For non-bridge harnesses (e.g. Pi), this will update the packages in `dependencies`.

Run these commands exactly as below:

```bash
# Claude Code
pnpm --filter harness-claude-code update @anthropic-ai/claude-agent-sdk @modelcontextprotocol/sdk --latest --lockfile-only
# Codex
pnpm --filter harness-codex update @openai/codex-sdk --latest --lockfile-only
# Deep Agents
pnpm --filter harness-deepagents update @langchain/core @langchain/langgraph deepagents langchain langsmith --latest --lockfile-only
# OpenCode
pnpm --filter harness-opencode update @opencode-ai/sdk --latest --lockfile-only
# Pi
pnpm --filter harness-pi update @earendil-works/pi-coding-agent --latest --lockfile-only
```

For the bridge dependencies of bridge harnesses, you must additionally run the following commands. It is important to specify the `config.minimumReleaseAge` flag in accordance with what `pnpm-workspace.yaml` defines, because for these commands the `--ignore-workspace` flag is needed.

Run these commands exactly as below:

```bash
# Claude Code
pnpm --dir packages/harness-claude-code/src/bridge update @anthropic-ai/claude-agent-sdk @anthropic-ai/claude-code @modelcontextprotocol/sdk --latest --ignore-workspace --config.minimumReleaseAge=4320
# Codex
pnpm --dir packages/harness-codex/src/bridge update @openai/codex-sdk --latest --ignore-workspace --config.minimumReleaseAge=4320
# Deep Agents
pnpm --dir packages/harness-deepagents/src/bridge update @langchain/anthropic @langchain/core @langchain/langgraph deepagents langchain langsmith --latest --ignore-workspace --config.minimumReleaseAge=4320
# OpenCode
pnpm --dir packages/harness-opencode/src/bridge update @opencode-ai/sdk opencode-ai --latest --ignore-workspace --config.minimumReleaseAge=4320
```

#### Example dependencies

Check the `package.json` files in `examples/harness-e2e-next` and `examples/harness-e2e-tui` for any of the above SDKs they depend on. Those dependencies need to be updated to match the exact version used in the packages as well.

### Verification

Run the verification script to ensure all relevant dependency versions are aligned:

```bash
./tools/verify-harness-adapter-deps.mjs
```

If this script shows errors, you must address them, then rerun the verification script until it passes.
