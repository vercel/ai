import type {
  OnChunkEvent,
  OnFinishEvent,
  OnStartEvent,
  OnStepFinishEvent,
  OnStepStartEvent,
  OnToolCallFinishEvent,
  OnToolCallStartEvent,
} from '../generate-text/callback-events';
import type { Output } from '../generate-text/output';
import type { ToolSet } from '../generate-text/tool-set';
import { Listener } from '../util/notify';

/**
 * Implement this interface to create custom telemetry integrations.
 * Methods can be sync or return a PromiseLike.
 */
export interface TelemetryIntegration {
  /**
   * Called when the generation operation begins, before any LLM calls are made.
   * Use this to initialize telemetry spans, record input parameters, or set up
   * tracking state for the entire generation lifecycle.
   *
   * The event includes the full configuration: model, messages, tools, sampling
   * parameters, and telemetry settings.
   */
  onStart?: Listener<OnStartEvent<ToolSet, Output>>;

  /**
   * Called when an individual step (single LLM invocation) begins.
   * A generation may consist of multiple steps (e.g. when tool calls trigger
   * follow-up LLM calls). Use this to create per-step spans or record
   * step-level inputs.
   *
   * The event includes the step number, accumulated previous step results,
   * and the messages that will be sent to the model.
   */
  onStepStart?: Listener<OnStepStartEvent<ToolSet, Output>>;

  /**
   * Called when a tool execution begins, before the tool's `execute` function
   * is invoked. Use this to create tool-level spans or log tool invocations.
   */
  onToolCallStart?: Listener<OnToolCallStartEvent<ToolSet>>;

  /**
   * Called when a tool execution completes, either successfully or with an error.
   * The event uses a discriminated union on the `success` field — check
   * `event.success` to determine whether `output` or `error` is available.
   *
   * The event includes execution duration (`durationMs`) for performance tracking.
   */
  onToolCallFinish?: Listener<OnToolCallFinishEvent<ToolSet>>;

  /**
   * Called for each chunk received during streaming.
   * Only relevant for `streamText` — not called during `generateText`.
   */
  onChunk?: Listener<OnChunkEvent>;

  /**
   * Called when an individual step (single LLM invocation) completes.
   * The event is a `StepResult` containing the model's response, tool calls
   * and results, usage statistics, finish reason, and optional request/response
   * bodies.
   */
  onStepFinish?: Listener<OnStepFinishEvent<ToolSet>>;

  /**
   * Called when the entire generation completes (all steps finished).
   * The event extends the final step's result with aggregated data: an array
   * of all step results (`steps`) and total token usage across all steps
   * (`totalUsage`).
   */
  onFinish?: Listener<OnFinishEvent<ToolSet>>;

  /**
   * Called when an unrecoverable error occurs during the generation lifecycle.
   * The error value is untyped — it may be an `Error` instance, an `AISDKError`,
   * or any thrown value.
   *
   * Use this to record error details on telemetry spans and set error status.
   */
  onError?: Listener<unknown>;

  /**
   * Optionally runs the tool execute function in a telemetry-integration-specific context. This enables
   * nested traces — e.g. when a tool's `execute` function calls `generateText`,
   * the inner call's spans become children of the tool span.
   *
   * @param params.callId - The call ID of the tool call.
   * @param params.toolCallId - The tool call ID.
   * @param params.execute - The function to execute.
   */
  executeTool?: <T>(params: {
    callId: string;
    toolCallId: string;
    execute: () => PromiseLike<T>;
  }) => PromiseLike<T>;
}
