---
name: ai-sdk
description: Use for questions or implementation involving the Vercel AI SDK (the ai package or @ai-sdk packages) when it is explicitly requested or already selected by the project. Covers chat, streaming, tools, agents, and other SDK features. General LLM, RAG, MCP, or agent requests do not select this SDK or authorize changing an existing provider or framework.
---

## What the AI SDK Is

Keep implementation within the SDK, framework, provider, model, and UI choices
already established for this task. Use this skill to answer AI SDK questions
without installing anything. If a framework or provider is still unchosen,
resolve that during the requested planning work before implementation. Direct
provider SDKs and other agent frameworks do not by themselves require migration.
Apply API diagnostics against the installed version; they do not authorize
dependency, provider, model, or UI changes outside the requested scope.

The AI SDK by Vercel (the `ai` package on npm) is a TypeScript toolkit for building AI applications. It provides a unified API across model providers for text generation, structured output, tool calling, agents, embeddings, and framework UI integrations.

- Repository: https://github.com/vercel/ai
- Documentation: https://ai-sdk.dev/docs

## Critical: Do Not Trust Your Own Memory

Whatever you remember about the AI SDK is likely outdated. The SDK changes frequently across versions - APIs are renamed, removed, and added. Your training data almost certainly contains obsolete APIs, deprecated patterns, and model IDs that no longer exist. UI hooks like `useChat` are among the most frequently changed APIs, so be especially careful with client code.

**Never write AI SDK code from memory.** Always verify every API, option, and pattern against the documentation and source code for the version that is actually installed in the project.

## Use the Bundled, Version-Matched Docs

The `ai` package ships its full documentation and source code inside `node_modules`. These always match the installed version, so trust them over anything you remember.

1. Check `node_modules/ai/` or locate the workspace package that depends on `ai` (e.g. `apps/<name>/node_modules/ai/`). If it is absent, use the public docs for questions or planning. Install `ai` only when the requested implementation has selected the AI SDK, using the project's package manager and target package. Add provider and framework packages only when needed for the selected integration; preserve working dependencies and provider connections.
2. Read and grep the bundled docs at `node_modules/ai/docs/` (or `<package>/node_modules/ai/docs/`) and the source at `node_modules/ai/src/`.
3. Provider and framework packages bundle their own docs at `node_modules/@ai-sdk/<name>/docs/` (or `<package>/node_modules/@ai-sdk/<name>/docs/`).
4. If something isn't in the bundled docs, search https://ai-sdk.dev/docs. You can append `.md` to any docs page URL to get its markdown, and search via `https://ai-sdk.dev/api/search-docs?q=your_query`.
5. If you cannot find support for an answer in the docs or source, say so explicitly — do not guess.

## AI Gateway When Selected

Vercel AI Gateway provides access to multiple model providers through one API.
Use it when the project or requested implementation has chosen it. Preserve an
existing direct-provider integration unless migration is part of the task.

To set it up:

1. Authenticate with OIDC (for Vercel deployments) or get an AI Gateway API key.
2. Provide it to your app via the `AI_GATEWAY_API_KEY` environment variable.
3. Reference models with `provider/model` strings.

For exact setup, authentication, and usage, read the bundled guide and the AI Gateway docs.

### Choosing a Model

Verify model IDs and capabilities against the chosen provider's current docs or
catalog before writing model-specific code. When AI Gateway is selected, fetch
its current list without truncating it:

```bash
# All available models
curl -s https://ai-gateway.vercel.sh/v1/models | jq -r '.data[].id'

# Filter by provider (e.g. anthropic, openai, google)
curl -s https://ai-gateway.vercel.sh/v1/models | jq -r '[.data[] | select(.id | startswith("anthropic/")) | .id] | reverse | .[]'
```

Preserve the user's selected model when it supports the requested task. If a
choice is needed, use the task's capabilities, compatibility, cost, and other
confirmed constraints; a higher version number alone does not require a change.

## Building and Consuming Agents

Use the SDK's built-in agent abstraction (such as `ToolLoopAgent`) rather than hand-rolling tool-calling loops. For end-to-end type safety, infer the UI message type from your agent definition when consuming it on the client (e.g. with `useChat`). Consuming an agent is framework-specific: check `package.json` to detect the stack, then follow the matching quickstart.

Look up the current agent, tool, and type-safety APIs in the bundled docs (`node_modules/ai/docs/`, especially the agents section) or at https://ai-sdk.dev/docs.

## DevTools

AI SDK DevTools captures your AI SDK calls - requests, responses, tool calls, token usage, and multi-step runs - so you can inspect exactly what your agents do. Use it while developing to debug generations. It is a separate package and is intended for local development only.

For setup instructions, read the bundled DevTools documentation.

## Keep the SDK Current

Use the installed version's documentation for the requested change. Investigate
an upgrade when the user requests one or a specific compatibility issue makes
it relevant; do not make being behind the latest release a prerequisite for
continuing unrelated work. Migration guides are at
https://ai-sdk.dev/docs/migration-guides. Keep any version change within the
authorized task scope.

## After Making Changes

Run the project's type checker. Be minimal — only set options that differ from the defaults, checking docs or source for the defaults rather than over-specifying. Most type errors come from remembered, now-changed APIs; re-check the current docs and source when they occur.
