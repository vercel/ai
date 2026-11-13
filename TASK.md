# Prototyping of `HarnessV2` and the relevant `HarnessAgent` iteration, focused on built-in support for durable harness execution

## Objective

Define the harness adapter API `HarnessV2` as a standalone iteration of `HarnessV1`, and update `HarnessAgent` to handle what's needed, both to facilitate durable execution of harnesses, heavily inspired by the approach taken in `vercel-labs/durable-world` (locally available in `../../durable-harness`).

## Task Steps

We will implement this task in several steps. Each step is a single scoped task we'll work through one by one. ALWAYS stick entirely to just the step you were asked to work on. NEVER touch anything that belongs into a subsequent step. Every time you have completed a step, mark its checkbox as done (`[x]`).

The steps are below:

1. [x] Define the most foundational versions of the `HarnessV2` contract types in `packages/harness/src/v2/`, and export them from the package's main entry point (next to the `HarnessV1` types).
   - Never import any `v1/` file from any of the new `v2/` files. Cross-references are strictly prohibited.
   - For types that fully or partly match between V1 and V2, still redeclare them.
2. [x] Scaffold a minimal new implementation of the `HarnessAgent` class in `packages/harness/src/agent/v2/harness-agent.ts` that rejects every existing setting but `harness` and `tools`.
   - It must also be called `HarnessAgent` (no alternate name!).
   - It must use the existing `HarnessAgentSettings` type directly (no redeclaring that type!).
   - It must have the same generics as the existing (V1) `HarnessAgent` class.
   - Its only public methods must be `createSession()`, `generate()` and `stream()`.
   - `generate()` and `stream()` must have the exact same signatures as the existing `HarnessAgent` implementation, except for the `HarnessAgentCallExtensions`. That type must be redefined in the new `harness-agent.ts` file with a new `HarnessAgentSession` type shape appropriate for the V2 needs.
   - Ensure `HarnessAgentSession` is a type here, not a class.
   - Change the existing `HarnessAgentSettings` in exactly one way: allow `harness` to be either a `HarnessV1` or a `HarnessV2`.
   - `generate()` and `stream()` must at runtime reject any properties that aren't serializable, even if they're part of the contract. Throw an error if they're passed.
   - `createSession()`, `generate()` and `stream()` at the end of their methods should simply throw "Not implemented yet".
   - Make the existing `HarnessAgent` class file import the new `HarnessAgent` class (aliased as `HarnessAgentV2`), and conditionally instantiate it as a private class property _if_ the given `harness` property`is a`HarnessV2`. then in all class methods short-circuit to immediately pass through to that wrapped instance equivalent method if the class property is populated with the new `HarnessAgentV2` instance. If the method doesn't have an equivalent in the new version of the class, immediately throw.
   - In the constructor of the new `HarnessAgent` (V2) class, throw immediately if the given `harness` is a `HarnessV1`, and safely assign the validated value to a class property typed `HarnessV2`.
3. [x] Add `@workflow/world` as a prod dependency for the `harness` package and add `world?: World` to `HarnessAgentSettings`.
   - In the existing `HarnessAgent` class, if it's _not_ forwarding through to the new `HarnessAgent` class, throw is a `World` is provided.
   - In the new `HarnessAgent` class, store the world in a private class property (optional of course).
   - Also store a private boolean class property `isDurable` that is set to `true` if a `World` was provided, otherwise to `false`.
4. [x] Add `getSandboxSession: ({ sandboxId }) => Promise<Experimental_SandboxSession | HarnessV2NetworkSandboxSession>` to `HarnessAgentSettings`
   - In the existing `HarnessAgent` class, if it's _not_ forwarding through to the new `HarnessAgent` class, throw is this callback is provided.
   - In the new `HarnessAgent` class, throw if this callback is _not_ provided.
5. [x] Properly implement the new `HarnessAgent`'s `createSession()` method.
   - Extend the new `HarnessAgentSession` type with a `async getSandboxSession()` method.
   - Implement a `DefaultHarnessAgentSession` class implementing the type, storing the sandbox session in memory (e.g. in a class property).
   - Implement a `DurableHarnessAgentSession` class implementing the type, relying on the `getSandboxSession` callback from the new `HarnessAgent`'s constructor.
   - Create an instance of one of the two classes depending on whether the `HarnessAgent` is used as durable or not (`!!isDurable`).
6. [x] Implement and configure `InMemoryWorld` as a non-durable `World`-compatible implementation.
   - Ideally this can use something that already exists as part of the `workflow` SDK and its `@workflow/*` packages; if that's not an option, we have to implement it ourselves.
   - In the new `HarnessAgent` constructor, change the private `world` property to no longer be optional; when the constructor doesn't receive it, it should then instantiate an `InMemoryWorld` and set it in that property.
7. [x] Scaffold `packages/harness/src/agent/v2/internal/create-log.ts` with function `createLog(input): HarnessAgentLog`.
   - Create `packages/harness/src/agent/v2/internal/types.ts` with a `HarnessAgentLog` type, which is the same as `HarnessV2Log`, except that its `append()` method accepts _any_ type of `HarnessV2LogEvent`, not just the `harness:`-prefixed ones. And its `onAppend` method must accept an object with both the listener callback and an optional `config?: HarnessAgentLogListenerConfig`, which defines which log event changes this listener should fire for (allow setting `types` array as allowlist and `ignoreTypes` array as denylist; default if neither is provided is to listen to all log event changes).
   - Also, instead of using `HarnessV2LogEvent`, define a superset type of it as `HarnessAgentLogEvent`, starting with a copy. Then we can add additional types to it that are internal to the `HarnessAgent` engine and should never be exposed to the underlying harness adapter (i.e. `HarnessV2LogEvent`).
   - The input for the `createLog()` function must include `world: World`. The log must used that world's relevant layer.
8. [x] Scaffold `packages/harness/src/agent/v2/internal/create-effect-function.ts` with function `createEffectFunction(input): HarnessAgentEffectFunction`.
   - Add a `HarnessAgentEffectFunction` type to `packages/harness/src/agent/v2/internal/types.ts`, which is the same as `HarnessV2DriveContext["effect"]` (redeclare it, DO NOT import).
   - The input for the `createEffectFunction()` function must include the `HarnessAgentLog`.
9. [x] Scaffold `packages/harness/src/agent/v2/internal/create-stream-writer.ts` with function `createStreamWriter(input): HarnessAgentStreamWriter`, and update the contract for replay-safe stream emission, per "Error representation", "Raw stream parts" and "Replay-safe stream emission" in HARNESS-V2.md.
   - Add the `HarnessAgentStreamWriter` type (`emit`, `unsafeEmit`, `retract`, `flush`, `close`) and the `HarnessAgentStreamPartRecord` type (a part plus the engine-only `startId` and `key` tags; every stream record is one) to `packages/harness/src/agent/v2/internal/types.ts`. Retractions are an engine-only `retract` variant of `HarnessAgentStreamPart`. There is no `createEmitFunction()` and no `HarnessAgentEmitFunction` type.
   - The input for the `createStreamWriter()` function must include `world: World`, the `HarnessAgentSession` and the drive's `abortSignal`; the writer writes to the session's World stream, named by `session.getStreamName()`, in strict order (one write in flight). Add `decodeStreamRecords()` next to it.
   - Add `HarnessV2EffectError` and use it for the `error` of `HarnessV2StreamPart` and `HarnessV2EffectOutput`; update `createEffectFunction()`'s error outputs accordingly.
   - Type the `raw` stream part's `rawValue` as `SerializableValue`.
   - Add the `HarnessEffectError` class in `packages/harness/src/errors/harness-effect-error.ts`, extending `HarnessError`.
   - Add `emit()` to `HarnessV2EffectContext` and provide it from `createEffectFunction()`, whose input must additionally include the `HarnessAgentStreamWriter`. Each attempt's `emit` calls `writer.emit({ part, startId })` and drops parts once the attempt ended; the writer is flushed before the attempt's end is committed.
   - Add `finishStep()` and `finishTurn()` to `HarnessV2DriveContext`, and rename its `emit()` to `unsafeEmit()`, documented as the undesirable exception. Only `HarnessV2EffectContext` has an `emit()`.
   - Add an engine-side `HarnessAgentStreamPart` type to `packages/harness/src/agent/v2/internal/types.ts` as a full copy of `HarnessV2StreamPart`, then remove `finish-step` and `finish` from `HarnessV2StreamPart` (they remain on `HarnessAgentStreamPart`).
   - Scaffold `createFinishFunctions(input): { finishStep: HarnessAgentFinishStepFunction; finishTurn: HarnessAgentFinishTurnFunction }` in `packages/harness/src/agent/v2/internal/create-finish-functions.ts`, with both function types in `types.ts` (redeclared, DO NOT import). Its input must include the `HarnessAgentLog`, the `HarnessAgentStreamWriter` and the drive's `abortSignal`; it reads the log once and keeps its turn state current via `onAppend`, like `createEffectFunction()`. Each function appends its internal log event and calls `writer.emit({ part, key })` only if that append returned `true`. Follow "Replay-safe stream emission" in HARNESS-V2.md for first-wins replays, turn identity (the latest delivered `prompt` submission ID), the step key (`${submissionId}:${stepNumber}`) and rejected calls.
   - Replace `finishStep()`'s `key` option with `stepNumber` (zero-based, counted by the adapter within the current turn).
10. [x] Scaffold `packages/harness/src/agent/v2/internal/create-execute-host-tool-function.ts` with function `createExecuteHostToolFunction(input): HarnessAgentExecuteHostToolFunction`.

- Add a `HarnessAgentExecuteHostToolFunction` type to `packages/harness/src/agent/v2/internal/types.ts`, which is the same as `HarnessV2DriveContext["executeHostTool"]` (redeclare it, DO NOT import).

11. [x] Scaffold `packages/harness/src/agent/v2/internal/create-gate-builtin-tool-function.ts` with function `createGateBuiltinToolFunction(input): HarnessAgentGateBuiltinToolFunction`.

- Add a `HarnessAgentGateBuiltinToolFunction` type to `packages/harness/src/agent/v2/internal/types.ts`, which is the same as `HarnessV2DriveContext["gateBuiltinTool"]` (redeclare it, DO NOT import).
- Change the `input` of `HarnessV2DriveContext["gateBuiltinTool"]` from `unknown` to `JSONValue`, like `executeHostTool()` (see "Host tool execution" in HARNESS-V2.md).

12. [x] Scaffold `packages/harness/src/agent/v2/internal/create-drive-context.ts` with function `createDriveContext(): HarnessV2DriveContext`.

- The function receives inputs of types `HarnessAgentSession`, `HarnessAgentLog`, `HarnessAgentEffectFunction`, `HarnessAgentStreamWriter`, `HarnessAgentFinishStepFunction`, `HarnessAgentFinishTurnFunction`, `HarnessAgentExecuteHostToolFunction`, `HarnessAgentGateBuiltinToolFunction`, etc and arranges them into the necessary aggregated shape.
- It builds the drive context's `unsafeEmit` from `writer.unsafeEmit`.
- It has to decorate `HarnessAgentLog` into `HarnessAgentV2Log`, and it has to create the sandbox session function based on the given session's sandbox session getter function. The other shapes should be compatible.

13. [x] Wire all the pieces that are individually handled by steps 7 to 11 together in `HarnessAgent`, so that the resulting `HarnessV2DriveContext` object can be passed to the `harness: HarnessV2` instance's `drive()` method.
14. [x] Implement `packages/harness-pi-v2`, a new from-scratch reimplementation of the Pi harness. Keep it minimal, but follow the key harness requirements. For now, the only things that it will support are custom `tools` (through `executeHostTool()`) and Pi's built-in tools (through `executeBuiltinTool()`).

- Ignore existing harnesses' code structure and architectural conventions. We'll want to build this as ideal as it is for the new architecture.
- Pi's built-in tools run in the adapter's process, with implementations that operate on the session's sandbox (from `sandbox()`), like the remote operations of the existing `packages/harness-pi` adapter.
- Deliver at most one prompt per turn (e.g. Pi's `followUpMode: 'one-at-a-time'`), as the current spec requires, until step 19 lifts that restriction.

15. [ ] Implement `examples/durable-harness-e2e-next`, a Next.js app with interactive testing UI for durable harness execution.

- All harness configurations in this app will run on a durable `World`.
- Initially, only include a simple example for the new `harness-pi-v2`.

16. [ ] Implement recovery of effect attempts that a dead drive left unfinished, so that a durable session continues after a crash.

- Every drive appends an engine-internal `drive-start` event (with its runtime deadline, if any) before it changes anything else in the session.
- At the start of a drive, find the attempts with an `effect-start` but no `effect-end`, and treat them as abandoned only once there is proof that the drive that started them is gone: the latest `drive-start`'s drive recorded a `drive-crash`, or its recorded deadline has passed. Never treat an attempt that a live drive may still be running as abandoned.
- Record each abandoned attempt as `interrupted` (`retryable` from its `replay`, with its last committed partial), and emit a `retract` part for the `startId`s of the current turn's attempts whose output is a retryable interruption, since a retry replaces their output. A non-retryable interruption's output stays.
- Have `executeHostTool()` and `executeBuiltinTool()` append an engine-internal `tool-execution-start` event, and await its commit, right before calling the tool's `execute` (after input validation and sandbox resolution). An abandoned tool attempt without that event provably never started its tool, so record it as `interrupted` with `retryable: true` regardless of the tool's `replay` policy. No end marker is needed: the `effect-end` is committed after `execute` returns. `gateBuiltinTool()` appends the same event right before it approves the call, since its effects share the `tool:` key with `executeBuiltinTool()` effects; it cannot cover a crash between the approval and the runtime starting the tool (see the TODO there).
- Without such proof, the new drive must yield without changing the session.
- At the start of a drive in an unfinished turn, write the turn's missing boundary parts to the session's stream, each under its log key: its `start` and its latest `finish-step`, if no record with that key is in the stream. A crash between a boundary event's log append and its stream write loses the part. Readers drop parts whose key they already saw. A finished turn is not repaired.
- Add `HarnessAgent.drive({ session })` (runs a drive without submitting a prompt: continues an unfinished turn or starts the turn of a prompt that has not started one), `HarnessAgent.readStream({ session, abortSignal })` (reads the latest turn from its `start` record across drives until its `finish`, in any process), and `HarnessAgent.experimental_crash({ session })` (appends a `crash-request`; the running drive records a `drive-crash`, flushes its writer and kills its process). Stream results apply `retract` parts: retracted output leaves `steps` and the UI message stream (`reset-step`, then the step's surviving parts again).

17. [ ] Add durable cancellation of a running turn: a new `HarnessAgent` method (e.g. `cancel({ session })`) appends an engine-internal cancel event to the session's log; the drive running the session, in any process, observes it, aborts its drive `stopAbortSignal`, and finishes the turn as `interrupted`. A call's `abortSignal` stays a local control that only ends that call's result.

18. [ ] Treat errors caught from a drive like crashes: the engine no longer finishes the current turn for every error thrown out of a drive (`failCurrentTurn()`), but leaves the turn unfinished, so that a later drive continues it from the log.

- Only end the turn (`finishReason: 'error'`, recorded as `finish-turn`) for errors known to be permanent, where another drive cannot succeed, and for a turn whose drives keep failing a bounded number of times in a row, as far as either case is relevant to us. `durable-harness` does the same with its `Unavailable` errors and its `failing` code after 8 failed deliveries in a row.

19. [ ] Allow several queued prompts to be delivered together as a single turn.

- Accept prompts while a turn is running (`generate()` and `stream()` currently reject), and queue them for after that turn.
- Merging is up to the adapter: it delivers all pending prompts in one effect (listing all of them in `deliveredSubmissionIds`), so that they start a single turn. Update the Pi adapter to do so.
- Change the spec alongside: remove the "at most one prompt that has not started a turn" rule from the `HarnessV2Effect['deliveredSubmissionIds']` docs and from the engine's `maybeStartTurn()`.
- Decide how `turnId` is derived for a turn started by several prompts. It stays opaque to adapters.
- Decide whose turn settings apply to a turn started by several prompts.

20. [ ] Let the turn of a follow-up prompt continue the stream that `agent.stream()` returned for the turn running when the prompt was submitted.

- A stream is not a per-turn construct: the session's World stream already spans all turns. The result keeps reading past its turn's `finish` part into the turns of follow-up prompts, instead of ending at its own turn's `finish`.
- This does not merge turns: each follow-up prompt still starts its own turn. No `HarnessV2` change.

21. [ ] Pass the session's work directory to the `execute` of the app's own tools run through `executeHostTool()`, which currently only receive the sandbox session (`experimental_sandbox`). Built-in tools run through `executeBuiltinTool()` do not need this, since the adapter's `execute` gets the work directory from `sandbox()`.

22. [ ] Define `HarnessV2Store` and its engine counterpart `HarnessAgentStore`, under the hood relying on specific `HarnessAgentLog` events (e.g. with type `store:...`), and include the adapter-specific type on `HarnessV2DriveContext`.

23. [ ] Implement `packages/harness-ai-sdk`, a new custom AI SDK harness where developers build their own durable `HarnessAgent` compatible harness on top of `ToolLoopAgent`.

- Ignore existing harnesses' code structure and architectural conventions. We'll want to build this as ideal as it is for the new architecture.

24. [ ] Revise the `packages/harness/src/v2/` tool type definitions for harness-specific needs.

- Define harness-specific tool types (at least as aliases) instead of just reusing AI SDK's existing types directly. Use type `harness-builtin` in favor of using `provider-defined` and `provider-executed`, which are not the same.
- Drop common tools as a foundation in favor of using `Tool["metadata"]` to store mapping data for a built-in tool to its common tool shape.
- Use the `ProviderDefinedTool` type for a harness's built-in tools.
- Revise the two adapters to use the new types.

25. [ ] Add support for (system) instructions to the new `HarnessAgent` and the two adapters.
26. [ ] Add support for skills to the new `HarnessAgent` and the two adapters.
27. [ ] Add support for a new `HarnessAgent` option (only actually support in the new `HarnessAgent` implementation!) that configures whether the agent's workDir can be trusted (i.e. project-level trust).

- Harness adapters must receive awareness of this configuration.
- If trusted, the harness adapter should use the workDir to discover and process instructions (e.g. `AGENTS.md`), skills (e.g. `.agents/skills/*`), configuration (e.g. `./claude/settings.json`), hooks (e.g. `.codex/hooks.json`), and MCP servers (e.g. `.mcp.json`) as far as the trust is configured.
- If not trusted (default), the harness adapter must completely ignore ALL of the above files even if present in the workDir.

28. [ ] Implement `packages/harness-claude-code-v2`, a new from-scratch reimplementation of the Claude Code harness. Keep it minimal, but follow the key harness requirements. For now, the only thing that it will support is custom `tools`, `instructions`, and `skills`.

- Ignore existing harnesses' code structure and architectural conventions. We'll want to build this as ideal as it is for the new architecture.
- As part of this, ensure the new `HarnessAgent` class properly supports a harness's bootstrap recipe.

29. [ ] Add support for fencing to the sandbox abstraction and the new `HarnessAgent`, so that a drive that lost ownership of a session can no longer change anything in the session's sandbox.

- Add an optional fencing capability to the sandbox abstraction (e.g. a `fenced({ token })` method returning a fenced sandbox session view). A sandbox that supports it must persist the highest token it has seen, refuse operations with a lower token in the same step as the operation itself, and stop all processes started under lower tokens once a higher token arrives.
- In the new `HarnessAgent` engine, derive a per-drive token that only increases across owners of a session (e.g. the committed log position of a drive claim event, or the World's in-band writer fence where available), and have the drive context's `sandbox()` return the fenced view when the sandbox supports it, including fenced versions of derived sessions such as `restricted()`.
- Fencing stays internal to the engine and the sandbox: never expose the token through `HarnessV2`; adapters only receive the already fenced session.
- Sandboxes without the capability keep working without fencing.

## Constraints & mindset

We are working on a prototype. The objective is not full coverage of all features, or a fully functional behavior at all times.

- Until task step 15, only run `pnpm check` and `pnpm type-check`, and `pnpm --filter harness test` for verification.
- After that task is done, after every step whatever we had in scope of the implementation must be functional, so also include end-to-end example run verifications at this point.
- That means there may still be parts that aren't (e.g. an API parameter for which the implementation just throws). But whatever the respective step adds in scope to the implementation has to fully work.

## Critical rules

You must adhere to these at every single step of this task.

- FULLY SEPARATE the code in `packages/harness/src/agent` that is for `HarnessV2`. Put it all in `packages/harness/src/agent/v2`. Even `HarnessAgent` itself we'll reimplement there from scratch.
  - The only exception is that you are allowed to modify `harness-agent.ts` and `harness-agent-settings.ts`, but even those only in very specific ways.
  - In those two files, you are allowed to extend (or in rare cases modify) the constructor input handling (basically what comes from the `HarnessAgentSettings` type) and check whether the given `harness` is a `HarnessV2`.
  - In the constructor and every single method, make the `harness` check (and other relevant checks) right in the very beginning, and if so route to the `v2` code you're writing.
  - The existing `HarnessAgent` class will basically become a proxy that conditionally passes through to the `v2` reimplementation of `HarnessAgent`: The OG `HarnessAgent` constructor`will internally conditionally create an instance of the new`HarnessAgent` implementation, and then the other methods will also proxy through to that if it's set.
  - Inside the `packages/harness/src/agent/v2` directory, never refer to this `HarnessAgent` class and the other V2-specific `HarnessAgent*` symbols as V2. Within that directory, refer to them as if they're the only version. For the actual `HarnessV2` spec, this does not apply, that one is _explicitly_ V2, as the names indicate.
  - Again, we want to keep changes to existing code minimal.
- All code in `packages/harness/src/agent/v2` must use the harness spec from `packages/harness/src/v2`. It must NEVER import from `packages/harness/src/v1`.
- DO NOT touch `packages/harness/src/v1` and `packages/harness/src/agent/internal` at all.
- DO NOT touch any of the pre-existing `packages/harness-*` packages.
- DO NOT touch the `Agent` contract from `packages/ai`. In fact, DO NOT touch `packages/ai` at all.
- DO NOT refer to `durable-harness` in any code or documentation or artifacts you write to this repository.
- For implementing a harness adapter (i.e. `packages/harness-*` code), follow [HARNESS-ADAPTER-REQUIREMENTS.md](./HARNESS-ADAPTER-REQUIREMENTS.md). DO NOT read these when working on `packages/harness`.
- Provide doc blocks for all class and type declarations, their method declarations, and for every object type's property declarations. Also provide doc blocks for exported functions.
  - For obvious symbols, keep the doc block very concise, a single descriptive statement. This almost always applies to properties, and a few trivial functions or methods. Whenever there is important nuance to document though, do that as needed, so that a future person or agent reviewing or modifying this code that lacks all your context still can get the shared understanding.
  - When it comes to functions and methods, use a one-sentence docblock only for genuinely self-explanatory and trivial ones. For functions or methods with e.g. state transitions, branching, persistence/replay behavior, or non-obvious failure semantics, document those contracts and edge cases even if it takes several sentences.
  - For classes that belong to the public consumer or adapter API, provide more elaborate descriptions including BRIEF (up to 20 lines) inline examples on how to use them. Do not duplicate this kind of description or examples on the constructor method.

## Detail specs already agreed upon and open questions

See [HARNESS-V2.md](./HARNESS-V2.md).
