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
| Prompt/content ordering, callback replay, prepared settings and persisted-result compatibility                                                   | `stream-text-iterator.test.ts`                                                                                               |
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
