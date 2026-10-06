# WorkflowAgent generation compatibility

This is the Phase 1 baseline for [#20813](https://github.com/vercel/ai/issues/20813).
It distinguishes existing `WorkflowAgent.stream()` behavior from the planned
`WorkflowAgent.generate()` contract. Generate remains unimplemented in this phase.

The target is the current repository's `ToolLoopAgent.generate()`, not an older
AI SDK release. The characterization tests must pass before extracting shared
execution. Known gaps below are work to resolve or document, not permanent
requirements to retain bugs.

## Compatibility matrix

| Area                    | Existing WorkflowAgent.stream                                                                                  | Planned WorkflowAgent.generate                                                                             |
| ----------------------- | -------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Model dispatch          | `doStream()` in a durable model step                                                                           | `doGenerate()` in a durable model step                                                                     |
| Input                   | `prompt` or `messages`; optional writable                                                                      | `prompt` or `messages`; no streaming transport options                                                     |
| Completion              | Promise resolves after streaming and tool work                                                                 | Promise resolves with completed generation result                                                          |
| Text and finish reason  | Final text on `steps.at(-1).text`; final finish reason on result                                               | `text`, `finalStep`, and finish reasons describe the final step                                            |
| Tool calls/results      | Top-level fields describe the final step; earlier tools remain in `steps`                                      | Top-level fields aggregate all steps, including static/dynamic classifications                             |
| Other generated content | Available in individual steps                                                                                  | Content, files, sources, and warnings aggregate all steps                                                  |
| Conversation            | `messages` includes input history and generated messages, subject to preparation                               | `responseMessages` contains generated messages only, tracked independently of prompt replacement           |
| Usage                   | `totalUsage` sums top-level counts but loses token details and treats missing counts as zero                   | Core usage aggregation preserves details and unknown counts; `usage` and `totalUsage` agree                |
| Structured output       | Explicit output spec controls response format and parsing; absent spec leaves output undefined                 | Core parsing conditions, text default, and unavailable-output behavior                                     |
| Default step limit      | No implicit limit                                                                                              | 20 steps, matching ToolLoopAgent; explicit stop conditions override                                        |
| Client tools            | Stops with unresolved calls when a tool has no `execute`                                                       | Same stopping behavior; retain completed sibling results                                                   |
| Tool failures           | Local failures become model-visible tool errors                                                                | Match core tool-error behavior rather than treating every tool failure as a terminal generation failure    |
| Terminal model errors   | A stream error part resolves with `result.error`, even when its value is undefined; thrown failures can reject | Match core generate error propagation                                                                      |
| Aborts                  | Existing `onAbort`/partial-result behavior; not the model-error path                                           | Reject on cancellation, with supported runtime behavior explicitly tested                                  |
| Callbacks               | Constructor and per-call callbacks compose; aliases and early-exit behavior have existing coverage             | Reuse composition but match core generate lifecycle and output-parsing order                               |
| Per-call preparation    | Existing option precedence is characterized independently                                                      | Preserve supported Workflow options and explicitly document any differences from ToolLoopAgent preparation |
| Approvals               | Stops for approval; request emission/signing is currently tied to the writable branch                          | Approval requests/signatures must be result/conversation data even without a writable                      |
| Metadata                | Some request/performance fields are placeholders                                                               | Preserve available data; document remaining differences without inventing measurements                     |

Do not implement generate by collecting a stream: that still requires streaming
provider support and inherits its error behavior. Do not place the entire agent
loop in one durable step: model and tool work need their own boundaries.

### Preparation and callbacks

The new characterization test exercises constructor defaults, `prepareCall`, and
per-stream generation settings together. For these settings, the existing stream
precedence is constructor defaults < `prepareCall` < explicit stream options.
This is not a blanket rule for every option or a claim that core uses the same
preparation contract.

Use one shared execution path in later phases, with separate adapters for the
public generate and stream contracts. Sharing orchestration does not require
changing stream's callbacks, final-step fields, error results, or step limit.

### Known gaps and separate decisions

- `generate()` currently throws `Not implemented`; Phase 1 does not add skipped
  or failing tests that pretend a future implementation is available.
- `experimental_transform` is declared but not applied by WorkflowAgent at the
  baseline. Implementing it is outside the generate work unless explicitly
  included. Do not interpret its presence in the type as working transformation
  behavior.
- Usage details, metadata completeness, and approval data ownership need explicit
  work in later phases. Avoid tests that enshrine these shortcomings as desired
  long-term behavior.
- Keep stream's unbounded default while introducing generate's 20-step default.
  Unifying existing defaults would be a separate behavior change.
- Standalone Workflow `generateText`/`streamText` exports remain a separate,
  non-blocking decision. If added, they should share execution and default to one
  step; a writable-based Workflow API must not promise core `StreamTextResult`
  compatibility.

## Workflow boundaries

Unit tests execute step functions as ordinary functions. They do not prove
durability, replay, serialization, or hook suspension behavior.

Keep full tool definitions, schemas, agent instances, and orchestration callbacks
in workflow context. Pass compact data and explicitly supported step references
across model-step boundaries. The existing `repairToolCall` integration fixture
uses a `"use step"` function reference; arbitrary callback closures are not
therefore portable.

Preserve the timeout behavior that avoids native timeout signals inside the
Workflow VM and passes an absolute deadline to model steps. The current streaming
adapter disables Workflow-level step retries (`doStreamStep.maxRetries = 0`) and
uses SDK retries. Generation should make retry ownership equally explicit.
An expired model-call deadline and cancellation of a tool waiting on a Workflow
hook are separate behaviors; test and document both rather than assuming one
implies the other.

Initially, the generate result API is guaranteed within workflow code. Examples
should return selected serializable fields through `run.returnValue`. Returning
the complete result, including generated-file objects and result getters, needs
an explicit serialization contract. Phase 2 should test a representative durable
payload before fixing its shape; Phase 5 supplies comprehensive runtime coverage.

Approval secrets must continue to be resolved inside signing/verification steps.
Only the environment-variable reference crosses into their persisted arguments.

### Shared execution layout

Phase 2 separates `prepareInvocation`, shared `execute`, and stream outcome
interpretation. `model-call-iterator.ts` orchestrates model turns using the compact
types in `model-call.ts`; `build-model-step-result.ts` reconstructs derived fields
after the durable boundary. `doStreamStep` retains its original module, name, and
persisted payload shape. The non-streaming adapter is added in Phase 3.

`workflow-execution-result.test.ts` checks stream interpretation of outcomes.
`model-call-payload.integration.test.ts` verifies a representative payload across
a real suspension and another step boundary, including generated-file data,
dates, provider-result maps, and absent versus undefined failure values. A stream
marker checks that the completed producer step does not run again on resumption.
This does not claim exactly-once external effects under crashes or retries, or
automatic serialization of a complete public result object.

## Test coverage map

Paths below are relative to `packages/workflow/src` unless noted. Reuse these
suites as the loop is extracted rather than duplicating their scenarios.

| Contract                                                                                                                                         | Coverage                                                                                                                     |
| ------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| Matched core-generate/Workflow-stream responses, final/all-step tools, unresolved client calls, defaults, preparation precedence, callback order | `workflow-agent-contract.test.ts`, using its shared `createAgentModel` fixture                                               |
| Writable completion and close combinations on normal and client-tool early-return paths; actual raw chunk forwarding                             | `workflow-agent-contract.test.ts`                                                                                            |
| Callback aliases/composition, tool events, approvals, provider results and deferred results                                                      | `workflow-agent-compat.test.ts`                                                                                              |
| Tool errors, mixed client/executable/approval batches, signed approvals, approval continuation, contexts, aborts                                 | `workflow-agent.test.ts` (mocks the iterator; not a runtime test)                                                            |
| Model stream errors, including false/undefined error values and one error callback                                                               | `workflow-agent-stream-error.test.ts`                                                                                        |
| Structured response format and parsed output                                                                                                     | `workflow-agent-response-format.test.ts`                                                                                     |
| File/source retention in steps, callbacks, and history                                                                                           | `workflow-agent-file-source-retention.test.ts`                                                                               |
| Prompt/content ordering, callback replay, prepared settings and persisted-result compatibility                                                   | `model-call-iterator.test.ts`                                                                                                |
| SDK retries, disabled Workflow retries, elapsed deadlines and aborts                                                                             | `do-stream-step.test.ts`                                                                                                     |
| Raw-to-UI conversion, resume cursors, reset-step handling and approval signatures                                                                | `to-ui-message-chunk.test.ts`                                                                                                |
| Transport reconnect/replay, duplicate tails and interleaved text/reasoning                                                                       | `workflow-chat-transport.test.ts`, `workflow-chat-transport.stream-repair.test.ts`                                           |
| Existing real-runtime repair callback serialization and other Workflow scenarios                                                                 | `workflow-agent-e2e.integration.test.ts`, `test/agent-e2e-workflows.ts`                                                      |
| Current core generate semantics used as the target                                                                                               | `packages/ai/src/agent/tool-loop-agent.test.ts`, `packages/ai/src/generate-text/generate-text.test.ts` (repository-relative) |

The shared fixture supplies equivalent `doGenerate` responses and `doStream`
parts. It currently supports only text and tool calls and fails explicitly for
other content kinds. Extend its representations deliberately when adding Phase 3
generate parity scenarios. Compare semantic values, not incidental timing or
generated identifiers.

## Validation

Run the Workflow Node and edge suites for this phase, including existing
transport/transform tests, plus `pnpm type-check:full` and formatting/lint checks.
Real-runtime tests use the separate `test:integration` command; ordinary Node or
edge suites do not count as validation of Workflow serialization or replay.

## Phase 3 implementation

`generate()` now selects `doGenerateStep` in the shared iterator. The durable
adapter returns compact ordered content and failure data; core's content converter,
step class, usage aggregation, and generation result class reconstruct the public
result in workflow context. Model failures, including `undefined`, are rethrown
outside the step so Workflow cannot normalize them before the agent sees them.

`workflow-agent-generate.test.ts` compares multi-step and provider results with
ToolLoopAgent, and covers defaults, output parsing order, history replacement,
context, metadata, errors and type inference. `do-generate-step.test.ts` exercises
retry/deadline, repair and required tool-choice behavior. Real-runtime tests cover
generation with durable tools, repair step references and undefined failures.

The matrix above records the original baseline and overall target. Approval
request creation without a writable is implemented in Phase 4. Cancellation
and result serialization coverage is recorded under Phase 5 below. Generate
currently reports model response timing; complete tool/step timing is not measured.

## Phase 4 implementation

The shared loop creates local approval data and signs requests independently of
stream output. Both adapters retain provider approvals; the stream adapter restores
the provider-executed marker when converting an already prepared provider prompt.
Pending provider approvals do not create synthetic tool results.

`workflow-agent-approval.test.ts` runs matched generate/stream scenarios for signed
approval and denial, tampering, changed schemas/policies, removed tools, mixed
client/executable/approval batches, deferred provider results and tool errors.
Removed tools reject continuation rather than execute an unavailable tool.
`workflow-agent-approval.integration.test.ts` checks signed round trips through the
real runtime, persisted environment-variable references instead of secrets, and
hook suspension/resumption retaining completed model/tool step records. Replay
retention is not an exactly-once guarantee for external side effects.

## Phase 5 boundary coverage

`workflow-agent-boundaries.integration.test.ts` exercises generation deadlines,
SDK retries within a single durable attempt, provider aborts, expiration across
hook suspension, cancellation of a suspended run, and selected rich result fields
across replay. Dispatch traces distinguish SDK attempts from Workflow attempts;
persisted deadline inputs and dispatch traces prove that expired adapters do not
initiate another model call. The existing Phase 2–4 suites continue to cover payload compatibility,
repair references, signed approval continuation and completed-tool replay.

The supported serialization contract is the result API inside workflow code and
selected data returned through `run.returnValue`. Whole result class instances,
exactly-once external effects, hook cancellation through a model timeout, complete
tool/step timing, and ToolLoopAgent's call-options schema are not promised.

## Phase 6 proposal: defer standalone text exports

**Status:** proposed for the [WorkflowAgent.generate stack](https://github.com/vercel/ai/issues/20813), pending review. This assessment describes the Phase 5 implementation, not an already released API. It does not add exports.

Recommend shipping `WorkflowAgent.generate()` before exposing standalone `generateText` or `streamText` from `@ai-sdk/workflow`. One-off summarization, structured extraction, or a single durable model step can use a locally constructed agent. Callers that want a one-step limit can set `stopWhen: isStepCount(1)`; that limit is explicit because the new agent generation default is 20 steps. Streaming jobs can already supply a writable to `agent.stream()`.

Standalone functions would make those one-off calls shorter and allow function-oriented APIs without agent configuration. That benefit is real, but it does not yet justify another public contract for defaults, inference, lifecycle callbacks, approval continuation, errors, and streaming delivery. Reusable instructions, tools and preparation still fit the agent API naturally.

### What is already shared

The implemented dependency path is:

```text
WorkflowAgent.generate / stream
  → private prepareInvocation + execute
    → modelCallIterator
      → doGenerateStep / doStreamStep
```

The durable model adapters, compact result payloads, iterator, approval/signature steps, and core content/usage/result helpers are reusable. Preserve their durable identities and persisted payload compatibility in any future extraction.

The orchestration is shared between modes, but is not yet a standalone execution function. `prepareInvocation` merges constructor and call settings and runs `prepareCall`. `execute` still reads instance tools, constructor callbacks, output specifications, repair hooks, and step preparation. `WorkflowExecutionData` is currently derived from `WorkflowAgentStreamResult`, and the generate result adapter lives on the class. Exporting the iterator directly would omit tool execution, approvals, callbacks, finalization and result assembly.

### Boundary required before adding standalone functions

If concrete use cases justify exports, first extract an internal execution entry point that accepts fully resolved settings and callbacks. Move the remaining instance reads to the agent's preparation layer and reuse the existing result adapters. Do not have standalone functions construct an agent or copy its loop.

The intended dependency direction would then be:

```text
agent wrapper (constructor merging, identity, prepareCall)
standalone wrapper (explicit call options, one-step default)
  → shared prepared execution and result adapters
    → durable model steps
```

The agent wrapper must retain its current preparation precedence, callback composition and defaults. Standalone wrappers would accept the model, tools, contexts, prompt, output and execution callbacks explicitly, default to one step like core, and omit agent identity, constructor/call merging and `prepareCall`. Per-step preparation belongs in the shared execution contract. Existing agent defaults must not change as a side effect of this extraction.

### Incremental complexity

These are relative engineering estimates based on the implemented stack, not measured delivery times.

| Option                                                 | Runtime work                                                                                                                       | Public contract and validation work                                                                                         |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Keep execution internal; expose only the agent         | No additional extraction required for this release                                                                                 | Maintain the existing agent coverage                                                                                        |
| Export Workflow-shaped `generateText` only             | Moderate now: separate instance preparation from execution and reuse generate result assembly; small wrapper after that extraction | Moderate: one-step defaults, typed tools/contexts/output, errors, approvals, serialization and docs                         |
| Export Workflow-shaped `generateText` and `streamText` | Same extraction, plus an explicit transport adapter                                                                                | Moderate to high: also define writable ownership, close/finish behavior, stream errors, transforms, cancellation and replay |
| Promise drop-in core equivalents                       | High, especially for streaming                                                                                                     | High: core's live result readers and HTTP helpers require a different lifecycle and serialization contract                  |

The original low runtime-cost estimate applies **after** a fully prepared execution function exists. The current private instance method still needs moderate extraction work. Adding two exported names would be small; maintaining their contracts is the larger continuing cost.

A Workflow-shaped `streamText` could accept a writable and resolve with completed execution data. That is different from core's live `StreamTextResult` with `textStream`, `fullStream` and HTTP response helpers. Recreating those APIs would require explicit decisions about stream lifetime across suspension, ownership of readers, backpressure, cancellation and serializable state. Do not imply interchangeability merely by reusing the function name.

### Revisit when

- Concrete applications need function-oriented durable text calls and the agent wrapper creates recurring friction.
- Maintainers agree on the standalone one-step defaults and, separately, the writable-based streaming contract.
- The prepared execution boundary can be extracted without changing existing agent behavior or durable replay identities.
- Tests can exercise both wrappers against the same execution fixtures, including approvals, deadlines and result serialization.

Generation and streaming exports can be evaluated independently; a useful standalone generation API does not require promising core-style streaming. Deferring both now keeps this decision from blocking `agent.generate()` and leaves one Workflow tool loop to maintain.
