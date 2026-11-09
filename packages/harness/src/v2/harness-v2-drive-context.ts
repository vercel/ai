import type { JSONValue, SerializableValue } from '@ai-sdk/provider';
import type {
  Experimental_SandboxSession as SandboxSession,
  ToolResultOutput,
} from '@ai-sdk/provider-utils';
import type {
  HarnessV2Effect,
  HarnessV2EffectContext,
  HarnessV2EffectOutput,
} from './harness-v2-effect';
import type { HarnessV2Log } from './harness-v2-log';
import type { HarnessV2NetworkSandboxSession } from './harness-v2-network-sandbox-session';
import type {
  HarnessV2FinishReason,
  HarnessV2Metadata,
  HarnessV2StreamPart,
  HarnessV2Usage,
} from './harness-v2-stream-part';

/**
 * Options of one `effect()` call: the effect's identity and replay policy,
 * plus the work to run for a new attempt.
 */
export type HarnessV2EffectOptions<
  T extends SerializableValue = SerializableValue,
> = Pick<HarnessV2Effect, 'key' | 'name' | 'replay' | 'input'> &
  Partial<Pick<HarnessV2Effect, 'deliveredSubmissionIds'>> & {
    /**
     * Work to run for a new attempt: an async function whose return value is
     * the output, or an async generator whose yielded values are recorded as
     * partial results and whose last yielded value is the output.
     */
    fn: (context: HarnessV2EffectContext) => PromiseLike<T> | AsyncIterable<T>;
  };

/**
 * Host-provided function that runs a keyed effect under its replay policy and
 * records its output. Terminal outputs are replayed; retryable interruptions
 * permit another attempt. Callback failures become error outputs, while
 * serialization and persistence failures reject the call.
 */
export type HarnessV2EffectFunction = <
  T extends SerializableValue = SerializableValue,
>(
  opts: HarnessV2EffectOptions<T>,
) => Promise<HarnessV2EffectOutput<T>>;

/**
 * Model-facing output of a host tool result, as produced by a tool's
 * `toModelOutput()`.
 */
export type HarnessV2ToolResultOutput = ToolResultOutput;

/**
 * Value of a host tool execution: the `value` of a `result` outcome and the
 * `partial` of an `interrupted` one.
 */
export type HarnessV2ToolExecutionValue<T extends JSONValue = JSONValue> = {
  /**
   * Tool output converted to JSON.
   */
  readonly raw: T;

  /**
   * Model-facing output, present only on a final value and only when the tool
   * transforms its output for the model (`toModelOutput`). When absent, the
   * adapter sends `raw` to its runtime.
   */
  readonly modelOutput?: HarnessV2ToolResultOutput;
};

/**
 * Result of executing a tool through the host, including non-result outcomes.
 * Tool values are always JSON: the host converts tool outputs the same way the
 * AI SDK converts them for the model (e.g. a `Date` becomes an ISO string,
 * `undefined` properties are dropped, and a top-level `undefined` becomes
 * `null`). An `error` also covers invalid calls (e.g. an unknown tool or input
 * that does not match the tool's input schema), and an `interrupted` call that
 * is not retryable may have acted, so its output is unknown.
 */
export type HarnessV2ToolExecutionOutput<T extends JSONValue = JSONValue> =
  | HarnessV2EffectOutput<HarnessV2ToolExecutionValue<T>>
  | {
      /**
       * The host denied execution before the tool completed.
       */
      readonly type: 'denied';

      /**
       * Explanation supplied for the denial.
       */
      readonly reason: string;
    }
  | {
      /**
       * Execution is suspended pending an external action.
       */
      readonly type: 'suspended';

      /**
       * Whether approval or a client-side tool call is required to resume.
       */
      readonly reason: 'approval' | 'client-tool';
    };

/**
 * Outcome of gating a built-in tool before or during its execution.
 */
export type HarnessV2ToolGateOutput =
  | {
      /**
       * The host approved the tool call and provides its completion callback.
       */
      readonly type: 'approved';

      /**
       * Completes an approved call with its result, error, or interruption.
       */
      end(
        output: Exclude<
          HarnessV2ToolExecutionOutput,
          { readonly type: 'suspended' }
        >,
      ): Promise<void>;
    }
  | {
      /**
       * The host denied the tool call.
       */
      readonly type: 'denied';

      /**
       * Explanation supplied for the denial.
       */
      readonly reason: string;
    }
  | {
      /**
       * The call is waiting for approval outside the current drive.
       */
      readonly type: 'suspended';

      /**
       * The suspended gate is awaiting an approval decision.
       */
      readonly reason: 'approval';
    };

/**
 * Host capabilities exposed to a harness while it drives a session.
 */
export interface HarnessV2DriveContext {
  /**
   * Durable log used to read prior submissions and record harness events.
   */
  log: HarnessV2Log;

  /**
   * Runs a keyed effect under the supplied replay policy and records its output.
   */
  effect: HarnessV2EffectFunction;

  /**
   * Executes one of the app's own tools and returns its outcome.
   *
   * Each call is recorded as the effect `tool:${toolCallId}` named
   * `tool.${toolName}`, with the tool's `replay` policy (`'never'` when
   * omitted): a call already recorded returns its recorded outcome without
   * running the tool again. `input` must already be parsed from the model's
   * JSON. Invalid calls (an unknown tool or input that does not match the
   * tool's input schema) are recorded as `error` outcomes too.
   *
   * The agent emits the `tool-result` parts (preliminary, final and error) of
   * host tools itself, so the adapter must not emit them. A tool without
   * `execute` (a client tool) resolves `suspended` without being recorded.
   */
  executeHostTool<T extends JSONValue = JSONValue>(call: {
    /**
     * ID of the tool call, unique across all tool calls.
     */
    toolCallId: string;

    /**
     * Name of the tool to execute.
     */
    toolName: string;

    /**
     * Tool input, already parsed from the model's JSON.
     */
    input: JSONValue;
  }): Promise<HarnessV2ToolExecutionOutput<T>>;

  /**
   * Requests host approval before executing an adapter-owned built-in tool.
   */
  gateBuiltinTool(call: {
    toolCallId: string;
    toolName: string;
    input: unknown;
  }): Promise<HarnessV2ToolGateOutput>;

  /**
   * Resolves the sandbox session and working directory for this drive attempt.
   */
  sandbox(): Promise<{
    session: SandboxSession | HarnessV2NetworkSandboxSession;
    workDir: string;
    fence?: number;
  }>;

  /**
   * Finishes the current AI SDK step (one model call plus the tool calls
   * resulting from it, however many effects that spans); every step must end
   * this way. `stepNumber` is counted by the adapter, zero-based within the
   * current turn, including across drives: after a resume, the adapter must
   * continue counting from the steps the turn already finished.
   *
   * Records the step and emits `finish-step` only on the first call for its
   * `stepNumber` in the turn; a call replayed after a crash records and emits
   * nothing, even if its other options differ. The current turn is the one
   * started by the latest delivered prompt, even once it finished, so replays
   * of a finished turn's last step still resolve. A `stepNumber` beyond the
   * next unrecorded step, a new step for a finished turn, or a call before any
   * prompt was delivered is rejected. Resolves after the
   * step is recorded and `stopWhen` was evaluated (which may abort
   * `yieldRequested`), so it must be awaited before starting the next step.
   */
  finishStep(opts: {
    /**
     * Zero-based number of the step within the current turn.
     */
    stepNumber: number;

    /**
     * Reason reported for the step's completion.
     */
    finishReason: HarnessV2FinishReason;

    /**
     * Usage attributed to this step.
     */
    usage: HarnessV2Usage;

    /**
     * Optional provider metadata associated with this step.
     */
    harnessMetadata?: HarnessV2Metadata;
  }): Promise<void>;

  /**
   * Finishes the current turn (`finishReason: 'error'` for a turn the runtime
   * failed); every turn must end this way. The turn's identity is derived from
   * the prompt submission that started it.
   *
   * Records the finish and emits `finish` only on the first call for the turn;
   * a call replayed after a crash records and emits nothing, even if its
   * options differ. The current turn is the one started by the latest
   * delivered prompt, even once it finished. A call before any prompt was
   * delivered is rejected.
   */
  finishTurn(opts: {
    /**
     * Reason reported for the turn's completion.
     */
    finishReason: HarnessV2FinishReason;

    /**
     * Aggregate usage across all steps in the turn.
     */
    totalUsage: HarnessV2Usage;

    /**
     * Optional provider metadata associated with the turn.
     */
    harnessMetadata?: HarnessV2Metadata;
  }): Promise<void>;

  /**
   * Undesirable exception: only ever call this if the harness is unable to run
   * its steps within an effect boundary via `effect()`, e.g. a closed runtime
   * whose model calls happen inside its own process.
   *
   * Emits a stream part outside any effect attempt. It is fenced to this
   * drive, but never restored after a crash, so the harness must never emit
   * parts again that it already emitted before (e.g. from replayed journal
   * records). Step and turn ends go through `finishStep()` and `finishTurn()`.
   * The regular way to emit stream parts is the effect context's `emit()`.
   */
  unsafeEmit(part: HarnessV2StreamPart): void;

  /**
   * Aborts work when the session or current drive attempt is cancelled.
   */
  abortSignal: AbortSignal;

  /**
   * Signals that the host requests the harness to yield control.
   */
  yieldRequested: AbortSignal;

  /**
   * Optional deadline imposed on the current drive attempt.
   */
  deadline?: number;
}
