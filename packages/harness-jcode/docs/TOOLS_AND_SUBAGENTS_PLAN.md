# Host-Defined Tools and Subagents Plan

## Status

Implementation plan only. This document does not modify public APIs or runtime behavior.

## Goals

Add secure host-defined tool execution to `@ai-sdk/harness-jcode`, including calls made by Jcode subagents, while preserving the HarnessV1 contract:

- The host owns and executes host-defined tools.
- Jcode receives only tool metadata and returns correlated calls.
- A Jcode agent waits for the host to submit each result.
- Native Jcode tools remain provider-executed and distinct from host tools.
- Subagents receive only an explicitly authorized subset of the root tool catalog.
- Disconnects, aborts, lifecycle operations, stale calls, and forged descendant identities fail closed.

## Current State

### HarnessV1

The universal contract already supports root-session host tools:

- `packages/harness/src/v1/harness-v1-session.ts` supplies `tools` on each prompt or continuation turn.
- `packages/harness/src/v1/harness-v1-tool-spec.ts` defines the name, description, and JSON Schema sent to a runtime.
- `packages/harness/src/v1/harness-v1-prompt-control.ts` defines `submitToolResult`.
- `packages/harness/src/v1/harness-v1-bridge-protocol.ts` serializes tool definitions in the bridge `start` frame.
- The shared bridge runtime correlates host tool calls with results through its turn control surface.

HarnessV1 does not define a universal host-configured subagent/profile API.

### harness-jcode

`packages/harness-jcode/src/jcode-session.ts` currently rejects non-empty `options.tools`, and its `submitToolResult` implementation throws. `packages/harness-jcode/src/jcode-bridge-session.ts` does the same.

Jcode tool events translated by `packages/harness-jcode/src/jcode-translate.ts` are native/provider-executed events:

```ts
providerExecuted: true;
dynamic: true;
```

They cannot represent Harness host tools because host tools must be emitted with `providerExecuted: false` and must wait for `submitToolResult`.

### Jcode core and SDK

Jcode has useful pieces but no SDK-visible external-tool broker:

- `crates/jcode-app-core/src/tool/mod.rs` has a tool registry and session policies.
- `crates/jcode-app-core/src/agent/turn_execution.rs` filters definitions and locks the tool snapshot.
- `crates/jcode-app-core/src/agent.rs` carries `allowed_tools` and `disabled_tools`.
- `crates/jcode-app-core/src/server/comm_session.rs` implements swarm spawning.
- `crates/jcode-protocol/src/wire.rs` defines `CommSpawn`, but it has no child tool policy.
- `crates/jcode-harness-api`, `crates/jcode-harness-api-server`, and the TypeScript/Rust SDKs expose native tool lifecycle events but no host tool registration or result request.

## Comparison With Other Harnesses

### Claude Code

`packages/harness-claude-code/src/bridge/index.ts` creates an in-process MCP server named `harness-tools`. Each handler:

1. Emits a Harness `tool-call`.
2. Waits on `turn.requestToolResult(toolCallId)`.
3. Emits/returns the result to Claude.

Strengths:

- Uses the shared bridge's correlation and cancellation lifecycle.
- Keeps `execute` on the host.
- Cleanly distinguishes host MCP tools from native tools.

Limitations:

- Task subagents generally see the same MCP server surface.
- It does not establish a reusable per-descendant allowlist architecture.
- An MCP server created inside the runtime is less natural for Jcode because Jcode already has an SDK/API boundary and its own registry.

### Codex

`packages/harness-codex/src/bridge/index.ts` and `src/bridge/tool-relay.ts` implement an authorized localhost HTTP relay and CLI shim because the Codex SDK path does not reliably expose MCP tools.

Strengths:

- Binds only to `127.0.0.1`.
- Checks names against the registered catalog.
- Requires an observed Codex command event to authorize a matching relay request.
- Avoids embedding bearer material in the generated script.

Limitations:

- Tool discovery depends on prompt guidance and shell invocation.
- Parsing/authorizing commands is complex and runtime-specific.
- This is explicitly an upstream workaround and should not become Jcode's primary design.

### Pi

`packages/harness-pi/src/pi-session.ts` uses in-process `defineTool` handlers. A handler emits the call, blocks on a pending promise, and is resolved by `submitToolResult`.

Strengths:

- The cleanest host-tool lifecycle.
- No secondary transport or shell relay.
- Exact tool definitions and results remain typed and correlated.

Limitations:

- Pi runs in the same Node process. Jcode runs behind a daemon/API boundary, so the pending-call broker must live in Jcode core and the SDK protocol.

### OpenCode descendant precedent

Although not one of the primary comparison targets, `packages/harness-opencode/src/bridge/index.ts` provides an important security pattern. It observes parent-to-child task relationships, adds only proven descendants to an authorized set, and ignores events from unknown sessions. Jcode should use the same fail-closed principle rather than trusting a child-supplied swarm ID, working directory, or parent identifier.

## Recommended Architecture

Implement a first-class, session-scoped **external-tool broker** in Jcode.

```text
Harness host
  |
  | register catalog / submit result
  v
Jcode SDK connection
  |
  +-- root session external-tool catalog
        |
        +-- root agent effective catalog
        |
        +-- authorized descendant session
              |
              +-- parent catalog intersect child allowlist
```

### Catalog ownership

A catalog is owned by:

- An authenticated/local SDK connection.
- One attached root Jcode session.
- A monotonically increasing catalog revision.

It is not process-global configuration and is not persisted as an executable capability in the session transcript.

When the SDK connection detaches or closes, Jcode revokes the catalog and rejects all pending calls. A later client must explicitly register a new catalog.

### Tool definition

Each definition contains:

```ts
interface ExternalToolDefinition {
  name: string;
  description?: string;
  input_schema?: unknown;
}
```

Jcode must validate:

- Tool name format and maximum length.
- Maximum number of definitions.
- Description and schema size.
- Duplicate names.
- Collisions with native, MCP, or reserved tool names.

The safest initial collision policy is rejection. A later implementation may use a reserved internal name while preserving the Harness-visible name, but aliases add translation and cache complexity.

### Invocation

An invocation includes:

```ts
interface ExternalToolCall {
  call_id: string;
  session_id: string;
  root_session_id: string;
  catalog_revision: number;
  name: string;
  input: unknown;
}
```

`call_id` must be globally unique for the broker lifetime. The pending-call entry also records the owner connection, actual calling session, catalog revision, cancellation token, and optional deadline.

### Result

The SDK submits:

```ts
interface ExternalToolResult {
  call_id: string;
  output: unknown;
  is_error?: boolean;
  error_message?: string;
}
```

Jcode rejects:

- Unknown or expired IDs.
- Duplicate results.
- Results sent by a different connection.
- Results for a superseded catalog revision when the call was not retained as in-flight.
- Results after the calling session or root catalog was revoked.
- Oversized result payloads.

### Execution lifecycle

An external tool adapter in Jcode core:

1. Revalidates catalog membership and the calling session's effective policy.
2. Allocates a call ID.
3. Emits `ExternalToolCall` to the owner SDK connection.
4. Waits for result, abort, deadline, session shutdown, catalog revocation, or connection loss.
5. Converts the response into Jcode `ToolOutput`.
6. Removes the pending entry exactly once.

Definition-time filtering is not sufficient. Execution-time revalidation is required because Jcode caches/locks tool definitions and catalog policy may change after a snapshot is created.

## Per-Subagent Allowed Tools

### Internal policy shape

Keep native and host-tool policies distinct:

```rust
struct SessionExternalToolPolicy {
    owner_root_session_id: String,
    catalog_revision: u64,
    allowed_external_tools: Option<HashSet<String>>,
}
```

Do not overload Jcode's existing `allowed_tools` internally. It already covers native and MCP naming semantics, including special `mcp` handling.

### Spawn request

Extend `CommSpawn` with either:

```rust
allowed_host_tools: Option<Vec<String>>
```

or a structured policy object if more policy dimensions are immediately required. `allowed_host_tools` is preferable to `allowed_tools` because it avoids ambiguity with Jcode-native tools.

Recommended semantics:

- Omitted: inherit the parent's effective external-tool catalog.
- Empty: expose no external tools.
- Present: expose the intersection of the parent effective catalog and requested names.
- Unknown or unauthorized names: reject the spawn request.
- No child can grant itself a tool not available to its parent.
- The policy is installed before the child's first model request and first locked tool snapshot.

A stricter deployment may choose omitted = none, but inheritance matches common delegation behavior. If inheritance is used, document it prominently and provide a root default policy setting.

### Descendant ownership

A child receives access only through a server-observed spawn edge. The server records:

```text
owner connection -> root session -> parent session -> child session
```

Do not infer access from:

- A claimed swarm ID.
- A claimed parent session ID supplied by the child.
- A shared working directory.
- Transcript metadata.

Nested children repeat the same intersection with their immediate parent's effective catalog.

### Routing child calls

An external call carries both actual `session_id` and `root_session_id`, but is delivered only to the owner connection. The host can use `session_id` for observability and policy decisions, while correlation and authorization rely on the pending-call entry rather than trusting fields sent back by the client.

## Required Jcode Changes

### `crates/jcode-harness-api/src/requests.rs`

Add requests:

```rust
SetExternalTools {
    session_id: String,
    tools: Vec<ExternalToolDefinition>,
}

SubmitExternalToolResult {
    session_id: String,
    call_id: String,
    output: serde_json::Value,
    is_error: bool,
    error_message: Option<String>,
}
```

A separate `SetExternalTools` request is preferable to adding tools only to `CreateSession`. HarnessV1 supplies tools per turn, and the catalog can change between turns without recreating the native session.

Define replacement semantics. In phase one, allow replacement only while the session is idle and has no pending external calls.

An explicit `ClearExternalTools` is optional if an empty `SetExternalTools` atomically clears the catalog.

### `crates/jcode-harness-api/src/events.rs`

Add:

```rust
ExternalToolCall {
    session_id: String,
    root_session_id: String,
    call_id: String,
    catalog_revision: u64,
    name: String,
    input: serde_json::Value,
}
```

Optionally add `ExternalToolCancelled` for UIs and diagnostics. Cancellation can otherwise be represented by rejecting result submission and terminating the pending SDK-side call.

Do not reuse `ToolStart`, `ToolExec`, or `ToolDone`. Those events represent tools Jcode executes and are translated as `providerExecuted: true`.

### `crates/jcode-harness-api/src/lib.rs` or a new external-tool module

Define and export stable external-tool wire types. Include limits and validation helpers near the protocol boundary.

### `crates/jcode-harness-api-server/src/translate.rs`

Translate the new API requests/events to core protocol messages while preserving `BridgeState` connection ownership.

Required checks:

- The connection is attached to the named root session.
- A catalog cannot be installed on an unrelated session.
- A result belongs to a call owned by this connection.
- Detach/disconnect emits a broker revocation command.
- Catalog updates are serialized with session lifecycle operations.

### `crates/jcode-harness-api-server/src/translate_tests.rs`

Add tests for:

- Registering a valid catalog.
- Rejecting registration before attach.
- Rejecting a wrong session ID.
- Empty catalog clearing.
- Result translation.
- Forged, duplicate, and wrong-connection results.
- Disconnect revocation.
- Backward compatibility for clients that never use external tools.

### `crates/jcode-protocol/src/wire.rs`

Add internal requests/events for:

- Set or replace external tool catalog.
- Submit external tool result.
- External tool invocation.
- Catalog/connection revocation.

Extend `CommSpawn` with `allowed_host_tools`.

Update protocol randomized/round-trip tests and tag parity expectations.

### `crates/jcode-app-core/src/tool/mod.rs`

Add a session-scoped external-tool broker, potentially in a new `tool/external.rs` module.

Responsibilities:

- Catalog ownership and revisioning.
- Effective per-session catalog calculation.
- Pending-call storage and correlation.
- Connection and session revocation.
- Tool definition creation.
- Execution-time authorization.
- Payload and timeout limits.

Do not add anonymous external tool definitions to a process-global registry. If the existing `Registry` is used, registrations must carry catalog/session ownership and must be removed atomically on revocation.

### `crates/jcode-app-core/src/agent/turn_execution.rs`

Merge effective external definitions into the tool list before `locked_tools` is populated.

On an idle catalog update:

- Clear or invalidate the relevant locked tool snapshot.
- Reset the prompt cache tracker as needed.
- Rebuild the definitions on the next turn.

Phase one should reject catalog changes during an active turn. A later phase may support revisioned in-flight catalogs.

### `crates/jcode-app-core/src/agent.rs`

Associate the agent/session with its external-tool policy and broker ownership. Restore and attach must not make old external definitions callable unless an active owner connection re-registers them.

Session persistence may retain descriptive history, but it must not persist a live executable host capability.

### `crates/jcode-app-core/src/server/comm_session.rs`

Extend `spawn_swarm_agent` to accept `allowed_host_tools` and calculate:

```text
child effective external tools =
  parent effective external tools
  intersection requested child allowed tools
```

Install this policy before creating or starting the child agent. Ensure both visible and headless/inline spawn paths apply the same policy.

Revoke descendants when the owning root connection closes. Decide whether children should stop or continue without external tools. The safest initial behavior is to cancel pending calls, remove external tools, and let otherwise valid native work continue only if Jcode can refresh the locked tool snapshot safely. Otherwise stop the child with an explicit error.

### `crates/jcode-app-core/src/tool/communicate.rs`

Add `allowed_host_tools` to the `spawn` action's arguments and documentation.

Validate requested names before sending the server request, then validate again server-side. Client/tool-side validation improves errors but is not a security boundary.

Update communicate tests for direct, nested, headless, visible, and denied spawns.

### TypeScript SDK: `sdk/typescript/src/protocol.ts`

Mirror the Rust API request/event definitions and external-tool types. Add an additive capability such as:

```text
external_tools_v1
```

The existing schema parity test must fail if Rust and TypeScript tags drift.

### TypeScript SDK: `sdk/typescript/src/client.ts`

Add:

```ts
setExternalTools(sessionId, tools): Promise<void>
submitExternalToolResult(sessionId, result): Promise<void>
```

`events()` should yield `external_tool_call` without automatically executing it. Execution remains an application/harness responsibility.

### TypeScript SDK tests

Update:

- `sdk/typescript/test/schema-parity.test.ts`
- `sdk/typescript/test/client.test.ts`
- `sdk/typescript/test/mock-harness.ts`
- live capability and isolation tests

Test multiple clients to prove one connection cannot answer another connection's calls.

### Rust SDK: `crates/jcode-sdk/src/client.rs`

Add equivalent methods and event types.

### Rust SDK parity

Update `crates/jcode-sdk/src/sdk_tests/parity.rs` and client behavior tests so the Rust and TypeScript SDKs remain capability-equivalent.

## Required harness-jcode Changes

### `packages/harness-jcode/src/jcode-client.ts`

Extend `JcodeSdkClient`:

```ts
setExternalTools(
  sessionId: string,
  tools: ReadonlyArray<ExternalToolDefinition>,
): Promise<void>;

submitExternalToolResult(
  sessionId: string,
  result: ExternalToolResult,
): Promise<void>;
```

Expose runtime capabilities through the factory/client if capability negotiation is not already available at adapter startup.

### `packages/harness-jcode/src/jcode-session.ts`

Replace the current `options.tools` rejection and throwing `submitToolResult`.

Per turn:

1. Normalize tool definitions and reject duplicate names.
2. Ensure the runtime advertises `external_tools_v1`.
3. Register/replace the catalog before sending the prompt.
4. Track the allowed names, catalog revision if returned, and pending call IDs.
5. On `external_tool_call`, verify catalog membership and emit:

```ts
{
  type: 'tool-call',
  toolCallId: event.call_id,
  toolName: event.name,
  input: JSON.stringify(event.input),
  providerExecuted: false,
  dynamic: false,
}
```

6. `submitToolResult` validates that the ID is pending for this turn, calls the SDK, and removes it once accepted.
7. Reject duplicate, unknown, native-tool, or post-turn submissions.
8. Abort/stop/destroy cancels the native turn and ensures all pending external calls are rejected or revoked.

Use Pi's promise/result lifecycle as the behavioral reference.

Do not emit a second synthetic consumer `tool-result` from native Jcode events. The Harness agent execution layer already echoes host-submitted results into its consumer stream.

### `packages/harness-jcode/src/jcode-translate.ts`

Add explicit translation for the new external call event. Keep native tool translation unchanged:

```ts
// Native Jcode tool
providerExecuted: true;
dynamic: true;

// Host-defined tool
providerExecuted: false;
dynamic: false;
```

The translator state should maintain separate native and external pending maps to prevent ID or lifecycle confusion.

### `packages/harness-jcode/src/jcode-bridge-protocol.ts`

The shared start schema already includes `tools`. No new start field is required.

Capability negotiation should surface an actionable unsupported error if the installed in-sandbox Jcode runtime or SDK lacks `external_tools_v1`.

Prefer shared bridge control messages over Jcode-specific tool result messages.

### `packages/harness-jcode/src/jcode-bridge-session.ts`

Implement `submitToolResult` by forwarding the shared bridge tool-result command over `SandboxChannel`.

Expand `JcodeBridgeChannel`'s inbound type if necessary to include the existing shared tool result command. Maintain a pending-call set and reject unknown/duplicate submissions before sending.

On bridge closure, reject the turn and clear pending calls.

### `packages/harness-jcode/src/bridge/index.ts`

For every turn:

1. Call SDK `setExternalTools` with `start.tools ?? []`.
2. Subscribe to SDK events before sending the prompt.
3. Translate `external_tool_call` to bridge `tool-call`.
4. Await `turn.requestToolResult(callId)`.
5. Call SDK `submitExternalToolResult`.
6. Clean up pending handlers on abort, stop, destroy, disconnect, or turn completion.

This bridge should remain a thin SDK driver. Do not add a second HTTP server or shell relay.

### `packages/harness-jcode/src/jcode-harness.ts`

Remove the host-tool unsupported path once SDK capability checks are available.

Host-defined tool support is implicit in the HarnessV1 session contract rather than a `supportsHostTools` flag. Continue declaring `supportsBuiltinToolFiltering: false` until native common-name mapping, filtering, and approval behavior are implemented separately.

### harness-jcode tests

Expand:

- `jcode-session.test.ts`
- `jcode-translate.test.ts`
- `jcode-harness.test.ts`
- bridge tests
- protocol schema tests

Test both experimental host execution and the normal in-sandbox bridge path.

## HarnessV1 Subagent Behavior

### Recommended first implementation

Do not add a universal HarnessV1 subagent API in the first tools change. Jcode swarms, Claude Task agents, OpenCode task sessions, and DeepAgents differ in lifecycle, visibility, nesting, resume semantics, and event shape.

Keep subagent configuration Jcode-specific, for example:

```ts
export interface JcodeHarnessSettings {
  // existing settings...
  readonly subagents?: {
    readonly defaultAllowedHostTools?: readonly string[];
    readonly profiles?: Readonly<
      Record<
        string,
        {
          readonly instructions?: string;
          readonly model?: string;
          readonly reasoningEffort?: string;
          readonly allowedHostTools?: readonly string[];
        }
      >
    >;
  };
}
```

The adapter/runtime maps these profiles to Jcode's native swarm configuration and spawn policy. Profile policies still intersect with the root turn's current catalog.

A profile must not be able to name or grant a tool absent from the active root catalog.

### Future universal alternative

After cross-adapter design work, introduce a `HarnessV1SubagentSpec` containing at least:

- Name and description.
- Instructions.
- Model and reasoning settings.
- Allowed host tools.
- Builtin filtering.
- Recursion/nesting policy.
- Maximum concurrency.
- Lifecycle and event visibility.
- Resume behavior.

Do not overload `HarnessV1ToolSpec` to describe a subagent. A subagent is a lifecycle-bearing runtime entity, not merely a function tool.

## Permission and Filtering Rules

1. Host-defined tools are not governed by Jcode's read/edit/bash permission mode. The Harness framework controls and executes them.
2. Native built-in filtering and host-tool catalog filtering remain separate.
3. Jcode validates host-tool membership when advertising definitions and again when executing a call.
4. Descendant access is deny-by-default when the spawn relationship or owner connection cannot be proven.
5. Per-child policy can only reduce the parent's effective catalog.
6. Unknown allowlist names reject the request instead of silently disappearing.
7. Tool and result payloads are size-limited and treated as untrusted input.
8. Disconnect, abort, stop, destroy, child termination, and catalog replacement settle all pending calls.
9. A restored session has no executable host tools until a current SDK connection registers them.
10. Active tool calls retain a fixed owner and revision. Catalog changes cannot hijack them.
11. Native, MCP, and external tool name collisions are rejected initially.
12. The model must never see broker credentials, socket authorization material, or owner tokens.

## Phased Implementation and Tests

### Phase 1: Jcode external-tool protocol and broker

Scope:

- Root sessions only.
- Catalog changes only while idle.
- No child inheritance yet.
- TypeScript and Rust SDK parity.

Tests:

- Protocol serialization and schema parity.
- Register, replace, and clear catalog.
- Tool definition validation and collisions.
- Call/result success and error results.
- Unknown, duplicate, late, and wrong-owner result rejection.
- Abort, disconnect, detach, and shutdown cancellation.
- Payload limits and malformed JSON/schema handling.
- Tool snapshot invalidation between turns.
- Native tools remain unaffected.

Exit criteria:

- A standalone SDK client can register a tool, receive a call, submit a result, and let the agent continue.
- No call can be completed from a second client connection.

### Phase 2: harness-jcode root host tools

Scope:

- `jcode-session.ts` host execution path.
- In-sandbox bridge path.
- HarnessV1 tool correlation.

Tests:

- Correct `providerExecuted: false` and `dynamic: false` flags.
- Description/schema forwarding.
- Host result and error forwarding.
- Multiple calls, parallel calls if Jcode permits them, and out-of-order results.
- Unknown and duplicate `submitToolResult` calls.
- Abort while waiting for a result.
- Stop/destroy while waiting.
- Runtime without `external_tools_v1` returns `HarnessCapabilityUnsupportedError`.
- Empty tools remove a previous turn's catalog.
- Resume requires re-registration and does not inherit a dead executor.
- Host and bridge behavior are equivalent.

Exit criteria:

- Existing Harness agent host-tool conformance behavior passes for Jcode.
- No HTTP relay or MCP configuration is required.

### Phase 3: Descendant ownership and allowlists

Scope:

- Extend `CommSpawn`.
- Record root/parent/child ownership.
- Route child calls to the root SDK connection.
- Apply recursive intersections.

Tests:

- Omitted, empty, and explicit child allowlists.
- Unknown/disallowed names reject spawn.
- Child cannot expand parent permissions.
- Grandchild receives the recursive intersection.
- Headless, inline, visible, and fallback spawn paths apply identical policy.
- Forged or unrelated session events are ignored/rejected.
- Child call includes actual child session metadata but is answered only by root owner.
- Root disconnect revokes descendants and pending calls.
- Child stop affects only its own pending calls.
- Policy is installed before the child's first tool snapshot.

Exit criteria:

- A child can call one explicitly permitted host tool and cannot see or execute another root tool.

### Phase 4: Jcode-specific subagent profiles

Scope:

- `JcodeHarnessSettings.subagents`.
- Profile mapping to model/instructions/effort/tool policy.
- Documentation and examples.

Tests:

- Valid and invalid profile names.
- Profile catalog intersection.
- Profile cannot grant unavailable tools.
- Default policy behavior.
- Nested profile behavior.
- Resume and runtime restart behavior.

### Phase 5: Optional HarnessV1 standardization

Scope:

- Compare Claude Code, OpenCode, DeepAgents, Pi-style agents, and Jcode.
- Add a universal contract only if common lifecycle semantics emerge.

Tests would be adapter conformance tests rather than Jcode-only tests.

## Alternatives

### Alternative A: Session-scoped MCP server

Run or configure a Jcode MCP server that relays calls to the host.

Advantages:

- Reuses Jcode's existing MCP registration.
- Similar to Claude Code.

Disadvantages:

- Requires transport/authentication between sandbox and host.
- Jcode MCP registration is asynchronous and tool snapshots have late-registration behavior.
- Per-session and per-descendant ownership must still be added.
- MCP naming/filter semantics can blur native and host tools.
- Reconnect and resume still require a broker.

Use only if Jcode intentionally standardizes all external tools on authenticated, dynamically managed MCP sessions. It does not eliminate most core work.

### Alternative B: Local HTTP relay or CLI shim

Copy the Codex workaround.

Advantages:

- Could be implemented mostly in `harness-jcode`.
- Avoids immediate SDK protocol additions.

Disadvantages:

- Expands attack surface with a local server.
- Requires bearer/authorization design and command correlation.
- Shell/prompt guidance is brittle.
- Hard to secure across Jcode subagents.
- Duplicates capabilities Jcode core can expose directly.

Reject as the primary design.

### Alternative C: Execute host tools inside Jcode

Send executable code or commands to Jcode.

Advantages:

- No asynchronous result protocol.

Disadvantages:

- Violates HarnessV1's host-owned `execute` model.
- Cannot safely serialize closures or application state.
- Moves credentials and authority into the sandbox/runtime.
- Breaks framework approval and observability expectations.

Reject.

### Alternative D: Process-global external tool registry

Register host tools globally in the Jcode daemon.

Advantages:

- Smallest core registry change.

Disadvantages:

- Cross-session data/capability leakage.
- Ambiguous result routing with multiple clients.
- Unsafe persistence and reconnect behavior.
- No defensible subagent ownership model.

Reject.

### Alternative E: New universal HarnessV1 subagent API immediately

Advantages:

- One consumer configuration surface.

Disadvantages:

- Current runtimes expose materially different lifecycle models.
- Delays root host-tool support.
- Risks freezing Jcode-specific swarm concepts into a weak abstraction.

Defer until after the Jcode-specific implementation and broader adapter comparison.

## Blockers and Open Decisions

1. **Cross-repository sequencing:** Jcode core, API, and SDK support must ship before `harness-jcode` can enable the feature safely.
2. **Catalog updates during active turns:** phase one should reject them. Supporting them later requires revisioned pending calls and explicit stale-call semantics.
3. **Omitted child allowlist:** inheritance is recommended for usability, but none-by-default is stricter. This must be documented and tested.
4. **Name collision policy:** initial rejection is safest. Internal namespacing is a possible later enhancement.
5. **Root disconnect behavior:** decide whether descendants stop or continue with external tools removed. Pending calls must always fail immediately.
6. **Result representation:** structured JSON preserves values, while Jcode `ToolOutput` may be text/image oriented. Define deterministic conversion and size limits.
7. **Image/file results:** phase one may support JSON/text only. Binary or image results need an explicit SDK wire representation rather than unbounded base64 inside generic JSON.
8. **Concurrency:** confirm whether Jcode may execute multiple tools concurrently and size the pending broker accordingly.
9. **Timeout ownership:** define whether the host, Jcode, or both can set deadlines. Jcode must always have a finite cleanup path.
10. **Capabilities:** older runtimes must fail with a clear unsupported error, not hang after receiving a tool definition they cannot execute.
11. **Resume:** external tools are ephemeral authority. Every restored session must re-register the active catalog.
12. **Universal subagents:** HarnessV1 has no first-class subagent definition contract. Keep profiles Jcode-specific until cross-adapter semantics are established.

## Recommended Delivery Order

1. Land Jcode protocol types and broker with SDK tests.
2. Publish a Jcode SDK/runtime version advertising `external_tools_v1`.
3. Add root host tools to `harness-jcode` behind capability detection.
4. Add descendant ownership and `allowed_host_tools` in Jcode.
5. Add Jcode-specific subagent profiles and documentation.
6. Evaluate a future HarnessV1 subagent contract using the working implementations as evidence.

This ordering produces a secure, testable root tool path early without committing HarnessV1 to premature subagent abstractions.
