# Harness Adapter Feature Matrix

Source audit of every `packages/harness-*` adapter in this monorepo. Findings come from package source, tests, READMEs, and package metadata rather than assumptions about the upstream CLIs.

**Legend:** ✅ supported, ◐ partial or runtime-dependent, ❌ unsupported.

## Summary matrix

| Harness         | Runtime and sandbox                                         | Auth                                                             | Host tools                                    | Built-in approvals / filtering | Skills and instructions                                        | Model and reasoning                                          | Streaming                                                          | Compaction                   | Lifecycle                                                          | Observability                      | MCP                       | Subagents                                          |
| --------------- | ----------------------------------------------------------- | ---------------------------------------------------------------- | --------------------------------------------- | ------------------------------ | -------------------------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------ | ---------------------------- | ------------------------------------------------------------------ | ---------------------------------- | ------------------------- | -------------------------------------------------- |
| **Claude Code** | In-sandbox Agent SDK/CLI bridge; WebSocket port required    | Anthropic/direct and gateway-aware credential brokering          | ✅ reserved host-tool MCP                     | ✅ / ✅                        | Native `.claude/skills`; instructions remain separate          | Model; adaptive, budgeted, or disabled thinking; effort      | Text, reasoning, tools, approvals, steps, finish                   | ✅ manual and native events  | Resume, suspend/continue, live detach, stop, destroy               | Diagnostics and debug forwarding   | ✅ native plus host relay | ✅ native `Agent` and task tools                   |
| **Codex**       | In-sandbox Codex SDK/CLI bridge; port required              | OpenAI direct/gateway with credential brokering                  | ✅ CLI/tool relay                             | ❌ / ❌; requires `allow-all`  | Native `.agents/skills`; developer instructions                | Default `gpt-5.5`; override, reasoning effort, native config | Text, reasoning, tools, file changes, steps, finish                | ❌ manual                    | Resume, suspend/continue, detach, stop, destroy                    | Diagnostics and debug forwarding   | ✅ native plus host relay | No explicit adapter API                            |
| **Pi**          | Host-process SDK using remote sandbox FS/shell; no port     | Provider/gateway resolution; reusable Pi agent dir               | ✅ in-process                                 | ✅ / ✅                        | Native `.agents/skills`, project skills, separate instructions | Model resolver and thinking level                            | Text, reasoning, tools, approvals, file changes, compaction, steps | ✅                           | Resume, suspend/continue, persisted detach/stop, destroy           | In-process errors/events           | ✅ `pi-mcp-adapter`       | No explicit adapter API                            |
| **ACP**         | Generic in-sandbox ACP implementation and bridge            | Configurable implementation/provider auth, forwarding, brokering | ✅ host-tool MCP                              | ✅ / ❌                        | Configurable skills dir and instruction mapping                | ACP model selection; reasoning implementation-dependent      | ACP text, thoughts, tools, plans, commands, finish                 | ❌ manual                    | Resume/load, replay/rerun, suspend/continue, detach, stop, destroy | Bridge diagnostics/debug           | ✅ native plus relay      | Implementation-dependent                           |
| **Cline**       | Host-process `@cline/agents`; remote sandbox ops; no port   | Auto, direct/provider, or AI Gateway                             | ✅ in-process                                 | ✅ / ✅                        | Materialized skills plus prompt section                        | Provider/model, endpoint/headers, reasoning effort           | Text, reasoning, tools, approvals, file changes, steps             | ❌                           | Resume, suspend/continue, persisted detach/stop, destroy           | Host-process errors                | ✅                        | No explicit adapter API                            |
| **Cursor**      | ACP wrapper; Cursor CLI installed in sandbox; port required | `CURSOR_API_KEY`; provider route remains account configuration   | ACP host tools                                | ACP approvals / no filtering   | ACP behavior                                                   | ACP model selection; no reasoning setting                    | ACP translation                                                    | ❌                           | Inherits ACP                                                       | Inherits ACP                       | ✅                        | Cursor-dependent                                   |
| **DeepAgents**  | In-sandbox LangGraph/Deep Agents bridge; port required      | Anthropic, OpenAI, or AI Gateway                                 | ✅                                            | ✅ / bridge-supported          | Host and project `.agents/skills`; per-turn instructions       | Model, Anthropic thinking/effort, recursion limit            | Text, reasoning, tools, approvals, steps                           | ❌                           | Suspend/continue, detach/replay, stop, destroy                     | Diagnostics/debug                  | ✅                        | Runtime-native, not separately surfaced            |
| **fx**          | ACP wrapper; canonical installer; port required             | AI Gateway key or OIDC                                           | ACP host tools and rich native terminal tools | ACP approvals / no filtering   | ACP behavior                                                   | ACP model selection                                          | ACP translation                                                    | ❌                           | Inherits ACP                                                       | Inherits ACP                       | ✅ with name mapping      | fx-dependent                                       |
| **Grok Build**  | ACP wrapper; pinned implementation; port required           | xAI direct or AI Gateway                                         | ACP host tools                                | ACP approvals / no filtering   | ACP behavior                                                   | ACP Grok model selection                                     | ACP translation                                                    | ❌                           | Inherits ACP                                                       | Inherits ACP                       | ✅                        | Runtime-dependent                                  |
| **Jcode**       | In-sandbox bridge by default; unsafe host-execution opt-in  | Forwarded env; optional inherited logins                         | ❌                                            | ❌ / ❌                        | No Harness skills; instructions transported by session         | Model and arbitrary reasoning-effort string                  | Text/reasoning/tool observations translated from SDK               | ✅ manual                    | Stop/resume and destroy only                                       | Limited bridge/process diagnostics | ❌                        | Not exposed by adapter                             |
| **OpenCode**    | In-sandbox OpenCode server bridge; port required            | Direct/gateway credentials with brokering                        | ✅ host-tool MCP                              | ✅ / ✅                        | `.agents/skills`; instructions forwarded                       | Provider/model split and reasoning variant                   | Text, reasoning, tools, usage, steps, finish                       | ✅ when runtime state allows | Full resume, suspend/continue, detach, stop, destroy               | Diagnostics/debug and usage        | ✅ native plus relay      | Native agents may appear as tools; no separate API |

## Deep comparison: Claude Code, Codex, and Pi

### Bootstrap and isolation

- **Claude Code** and **Codex** install their SDK/CLI and a package-owned bridge inside the sandbox. Both require an exposed TCP port and use per-session work and bridge-state directories. Both can replace real credentials with sandbox placeholders and inject the real values through outbound request transformations.
- **Pi** runs in the adapter host process. Its filesystem and shell tools target the supplied sandbox through remote operations and a virtual filesystem, so no port or bridge bootstrap is required. Pi extension factories consequently execute on the host and must be trusted.

Evidence:

- `packages/harness-claude-code/src/claude-code-bootstrap.ts`
- `packages/harness-claude-code/src/claude-code-harness.ts:831-1182`
- `packages/harness-codex/src/codex-bootstrap.ts`
- `packages/harness-codex/src/codex-harness.ts:208-554`
- `packages/harness-pi/src/pi-harness.ts:20-54`
- `packages/harness-pi/src/pi-remote-ops.ts`
- `packages/harness-pi/src/pi-workspace-vfs.ts`

### Authentication

- **Claude Code:** resolves Anthropic/gateway-oriented credential environments, supports request transformation brokering, and persists sandbox credential placeholders for resume.
- **Codex:** resolves OpenAI direct/gateway modes with the same request-transformation/fallback-forwarding architecture.
- **Pi:** resolves credentials in-process. `agentDir` can reuse Pi CLI `auth.json`, `models.json`, and settings; otherwise it uses per-session configuration.

Evidence:

- `packages/harness-claude-code/src/claude-code-auth.ts`
- `packages/harness-claude-code/src/claude-code-auth.test.ts`
- `packages/harness-codex/src/codex-auth.ts`
- `packages/harness-codex/src/codex-auth.test.ts`
- `packages/harness-pi/src/pi-auth.ts`
- `packages/harness-pi/src/pi-model-resolver.ts`

### Tools, approvals, and filtering

- **Claude Code:** exposes a large typed native catalog, including file, shell, web, notebook, planning, worktree, task, skill, MCP-resource, and subagent tools. It supports both built-in approvals and filtering. Host tools use the reserved `harness-tools` MCP server, and duplicate host-tool events are filtered from the native stream.
- **Codex:** supports host tools through CLI/tool relay but explicitly rejects native filtering and non-`allow-all` permission modes. The bridge configures `approvalPolicy: 'never'`, so native Codex approvals are not mediated by Harness.
- **Pi:** provides typed `read`, `write`, `edit`, `bash`, `grep`, `glob`, and `ls` tools. Both filtering and approvals are supported in-process. Permission checks use each tool's readonly/edit/bash kind.

Evidence:

- `packages/harness-claude-code/src/claude-code-harness.ts:137-775`
- `packages/harness-claude-code/src/bridge/tool-filtering.ts`
- `packages/harness-claude-code/src/bridge/index.ts`
- `packages/harness-codex/src/codex-harness.ts:205-222`
- `packages/harness-codex/src/bridge/index.ts:198`
- `packages/harness-codex/src/bridge/cli-relay.ts`
- `packages/harness-pi/src/pi-harness.ts:57-140`
- `packages/harness-pi/src/pi-session.ts:918-947,1603-1607`

### Skills and instructions

- **Claude Code:** writes `$HOME/.claude/skills/<name>/SKILL.md`, validates names and attached-file paths, and supplies skill names through the Claude SDK. Instructions remain separate from user text on fresh, resumed, and continued turns.
- **Codex:** current source writes `$HOME/.agents/skills/<name>/SKILL.md` and intentionally sends no skill metadata in the bridge start message. Instructions become Codex `developer_instructions`. This contradicts `packages/harness-codex/README.md`, which still says skills are injected inline on every turn.
- **Pi:** writes host-provided skills below sandbox `$HOME/.agents/skills`, retains project skills, and filters unrelated global discovery. Trusted inline extensions are supported, while filesystem-discovered extensions, themes, and prompt templates remain disabled.

Evidence:

- `packages/harness-claude-code/src/claude-code-harness.ts:1254-1279`
- `packages/harness-claude-code/src/claude-code-instructions.test.ts`
- `packages/harness-codex/src/codex-harness.ts:627-645`
- `packages/harness-codex/src/codex-instructions.test.ts:361-424`
- `packages/harness-codex/src/bridge/index.ts:125-126`
- `packages/harness-pi/src/pi-session.ts:337-347,495-503`
- `packages/harness-pi/src/pi-skills.ts`

### Model and reasoning

- **Claude Code:** explicit Anthropic model, adaptive thinking, fixed token-budget thinking, disabled thinking, summarized/omitted display, and effort control.
- **Codex:** deliberately defaults to `gpt-5.5` because the source documents an upstream Responses Lite/tool exposure issue for newer models. It accepts model override, `low | medium | high` reasoning effort, web-search toggle, and native snake_case `codexConfig`.
- **Pi:** resolves explicit or configured models and maps `thinkingLevel` directly into Pi session creation.

Evidence:

- `packages/harness-claude-code/src/claude-code-thinking.ts`
- `packages/harness-claude-code/src/claude-code-harness.ts:89-116`
- `packages/harness-codex/src/codex-harness.ts:74-123`
- `packages/harness-codex/src/bridge/index.ts:149-202`
- `packages/harness-pi/src/pi-model-resolver.ts`
- `packages/harness-pi/src/pi-harness.ts:27-43`

### Streaming parts

All three emit text, reasoning, tool-call/result, step, and final-finish information.

- **Claude Code:** additionally emits approval requests and coordinates native compaction. It supports schema-backed JSON output through bridge-side JSON-Schema-to-Zod conversion.
- **Codex:** includes `file-change` and bridge-thread tracking. A step tracker derives step boundaries from Codex events. Schema-backed JSON is supported, while schema-less JSON is rejected.
- **Pi:** includes approvals, file changes, and explicit `compaction` events. Translation happens directly from Pi in-process events rather than a wire protocol.

Evidence:

- `packages/harness-claude-code/src/bridge/create-emit-stream-event.ts`
- `packages/harness-claude-code/src/bridge/json-schema-to-zod.ts`
- `packages/harness-codex/src/bridge/create-emit-stream-event.ts`
- `packages/harness-codex/src/bridge/codex-step-tracker.ts`
- `packages/harness-pi/src/pi-translate.ts`
- `packages/harness-pi/src/pi-events.ts`

### Compaction and lifecycle

- **Claude Code:** implements manual compaction with optional instructions through a compaction latch. It can suspend a live bridge-side turn, continue by attaching/replaying/rerunning, live-detach, persistently stop, resume, and destroy.
- **Codex:** manual compaction is unsupported. Resume, suspend/continue, live detach, stop, and destroy are implemented with replay/rerun recovery.
- **Pi:** supports manual compaction. Suspension intentionally aborts the host-side SDK operation at a safe slice and returns continuation state. Since the runtime is host-process, detach may persist/stop rather than leave a sandbox bridge alive.

Evidence:

- `packages/harness-claude-code/src/bridge/compaction-latch.ts`
- `packages/harness-claude-code/src/claude-code-harness.ts:1746-1972`
- `packages/harness-codex/src/codex-harness.ts:920-1205`
- `packages/harness-pi/src/pi-session.ts:1262-1450`
- `packages/harness-pi/src/pi-resume-state.ts`

### Observability, MCP, and subagents

- **Claude Code:** translates bridge diagnostics, forwards debug configuration, accepts native MCP servers, reserves a host-tool MCP server, and explicitly exposes the native `Agent` subagent tool plus task management. A subagent stream fixture covers nested step translation.
- **Codex:** translates bridge diagnostics and accepts native MCP servers plus its host relay. No explicit subagent API or typed subagent tool was found.
- **Pi:** uses native in-process error/event handling and `pi-mcp-adapter`. No explicit subagent API was found.

Evidence:

- `packages/harness-claude-code/src/claude-code-harness.ts:293-425,928-930`
- `packages/harness-claude-code/src/bridge/__fixtures__/subagent-step-stream.json`
- `packages/harness-codex/src/codex-harness.ts:327`
- `packages/harness-codex/src/bridge/tool-relay.ts`
- `packages/harness-pi/package.json`
- `packages/harness-pi/src/pi-session.ts:429-452`

## Other adapters

### ACP

Generic bridge foundation used directly and by Cursor, fx, and Grok Build. It supports configurable implementation installation, executable arguments, implementation and provider authentication, credential brokering, host-tool MCP, permission-mode mappings, configurable native skill directories, several instruction mappings, output schema mappings, model selection, ACP resume/load, disk replay, lossy rerun, suspend/continue, detach, stop, and destroy. Built-in filtering and manual compaction are unsupported.

Evidence: `packages/harness-acp/src/acp-harness.ts`, `packages/harness-acp/src/v1/acp-v1-harness.ts`, `packages/harness-acp/src/v1/acp-v1-lifecycle.ts`, `packages/harness-acp/src/v1/bridge/permission-controller.ts`, `packages/harness-acp/src/v1/bridge/host-tool-mcp-server.ts`.

### Cline

Host-process `@cline/agents` adapter with remote sandbox tools. Supports direct/provider or AI Gateway auth, provider/model, custom endpoint and headers, reasoning effort, max iterations, host tools, approvals, filtering, materialized skills, MCP, resume, suspend/continue, persisted detach/stop, and destroy. Manual compaction is unsupported.

Evidence: `packages/harness-cline/src/cline-harness.ts`, `packages/harness-cline/src/cline-session.ts`, `packages/harness-cline/src/cline-tools.ts`, `packages/harness-cline/src/cline-skills.ts`, `packages/harness-cline/src/cline-mcp.ts`.

### Cursor

Thin ACP specialization using Cursor's installer. Requires `CURSOR_API_KEY`. The `auth` setting documents provider routing but cannot change Cursor account configuration. Provides typed mappings for Cursor shell, file, search, TODO, and related tool calls. Lifecycle and protocol features inherit ACP.

Evidence: `packages/harness-cursor/src/cursor-harness.ts`, `packages/harness-cursor/src/cursor-harness.test.ts`, `packages/harness-cursor/README.md`.

### DeepAgents

In-sandbox LangGraph bridge with Anthropic/OpenAI/AI Gateway auth, request brokering, host tools, approvals, filtering input, repository and host skills, model, Anthropic thinking/effort, recursion limit, and MCP. Current source implements suspend/continue and detach/replay even though the README status paragraph still says those are follow-ups. Manual compaction remains unsupported.

Evidence: `packages/harness-deepagents/src/deepagents-harness.ts:71-131,790-926`, `packages/harness-deepagents/src/bridge/approvals.ts`, `packages/harness-deepagents/README.md`.

### fx

ACP specialization installed through the canonical fx installer. Auth ultimately uses Vercel AI Gateway. Supports model selection, MCP, host tools, and a rich native terminal/monitoring catalog. Lifecycle and protocol behavior inherit ACP.

Evidence: `packages/harness-fx/src/fx-harness.ts`, `packages/harness-fx/src/fx-harness.test.ts`, `packages/harness-fx/README.md`.

### Grok Build

ACP specialization backed by a pinned Grok Build implementation. Supports direct xAI or AI Gateway auth, model selection, MCP, host tools, and typed terminal/edit/search/web tools. Lifecycle and protocol behavior inherit ACP.

Evidence: `packages/harness-grok-build/src/grok-build-harness.ts`, `packages/harness-grok-build/src/grok-build-harness.test.ts`, `packages/harness-grok-build/README.md`.

### OpenCode

In-sandbox OpenCode server bridge with direct/gateway auth and brokering, host-tool MCP, native MCP, approvals, filtering, `.agents/skills`, provider/model selection, reasoning variant, diagnostics, usage tracking, compaction, and full resume/suspend/continue/detach/stop/destroy lifecycle with replay/rerun recovery.

Evidence: `packages/harness-opencode/src/opencode-harness.ts`, `packages/harness-opencode/src/bridge/opencode-events.ts`, `packages/harness-opencode/src/bridge/opencode-usage.ts`, `packages/harness-opencode/src/bridge/opencode-finish-step.ts`, `packages/harness-opencode/src/bridge/host-tool-mcp.ts`.

## Jcode gaps and priorities

Jcode currently has the narrowest Harness surface among the standalone adapters. Its sandbox-first bridge and typed session translation are useful foundations, but the following features explicitly reject with `HarnessCapabilityUnsupportedError` or are absent:

1. **Host-defined tools:** no host tool relay or MCP transport.
2. **Built-in tool approvals:** `supportsBuiltinToolApprovals` is false.
3. **Built-in filtering:** `supportsBuiltinToolFiltering` is false and filtering input is rejected.
4. **Turn suspension:** no `doSuspendTurn` handoff.
5. **Lossless continuation:** `continueFrom` is rejected; no live/replayed turn continuation.
6. **Live detach:** detach does not preserve an active bridge turn for reattachment.
7. **Structured output:** JSON response formats are unsupported.
8. **Mid-turn user messages:** no negotiated user-message response path.
9. **Harness skills:** no materialization, discovery policy, or lifecycle fingerprinting.
10. **MCP:** no native MCP server configuration or reserved host-tool server.
11. **Observability:** no equivalent of the richer bridge diagnostic translation/reporting found in Claude Code, Codex, ACP, OpenCode, and DeepAgents.
12. **Subagents:** Jcode may support swarms internally, but the adapter does not expose a typed Harness-level subagent capability or stream correlation.
13. **Auth brokering:** credentials are forwarded through `env`; there is no request-transformation placeholder brokering equivalent to Claude Code, Codex, OpenCode, ACP, or DeepAgents.

Existing strengths are sandbox-first execution, an explicit warning and opt-in for unsafe host execution, custom model/reasoning options, manual compaction, stop/resume, destroy, bridge token authentication, configurable Jcode home, and focused session/translation tests.

Evidence:

- `packages/harness-jcode/src/jcode-harness.ts:42-110`
- `packages/harness-jcode/src/jcode-session.ts`
- `packages/harness-jcode/src/jcode-resume-state.ts`
- `packages/harness-jcode/src/jcode-bridge-session.ts`
- `packages/harness-jcode/README.md`

## Test breadth

Test files under each package's `src`:

| Package     | Test files |
| ----------- | ---------: |
| ACP         |         25 |
| Pi          |         14 |
| OpenCode    |         13 |
| Claude Code |         12 |
| Codex       |         10 |
| Cline       |          9 |
| DeepAgents  |          9 |
| Jcode       |          7 |
| Cursor      |          2 |
| fx          |          2 |
| Grok Build  |          2 |

ACP has the broadest direct protocol, lifecycle, recovery, permissions, authentication, host-tool, and stream-translation coverage. Cursor, fx, and Grok Build deliberately rely heavily on ACP tests. Claude Code, Codex, Pi, OpenCode, Cline, and DeepAgents each have focused runtime and lifecycle suites. Jcode tests cover bootstrap, bridge protocol/session, harness typing and behavior, session lifecycle, and stream translation, but do not yet cover the unsupported features listed above.
