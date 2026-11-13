import {
  isSerializableValue,
  type JSONValue,
  type SerializableValue,
} from '@ai-sdk/provider';
import {
  getErrorMessage,
  type Tool,
  type ToolSet,
} from '@ai-sdk/provider-utils';
import { NoSuchToolError } from 'ai';
import { HarnessEffectError } from '../../../errors/harness-effect-error';
import type {
  HarnessV2GateBuiltinToolFunction,
  HarnessV2ToolExecutionValue,
  HarnessV2ToolGateOutput,
} from '../../../v2/harness-v2-drive-context';
import type {
  HarnessV2EffectContext,
  HarnessV2EffectError,
  HarnessV2EffectOutput,
} from '../../../v2/harness-v2-effect';
import type { HarnessV2ToolResult } from '../../../v2/harness-v2-stream-part';
import { isPlainJSONValue } from './utils';
import type { HarnessAgentEffectFunction } from './create-effect-function';
import type { HarnessAgentLog } from './create-log';

/**
 * Gates one of the harness's built-in tools before the runtime runs it. Same
 * as `HarnessV2GateBuiltinToolFunction`, redeclared so the engine does not
 * depend on the adapter-facing type.
 *
 * Each call is recorded as the effect `tool:${toolCallId}` under the built-in
 * tool's replay policy. A new call is approved once its start is committed and
 * stays open until the adapter reports its outcome. A call with a recorded
 * output is denied; a recorded retryable interruption is approved again as a
 * new attempt, like any effect. The `tool-result` parts are emitted by the
 * engine.
 */
export type HarnessAgentGateBuiltinToolFunction =
  HarnessV2GateBuiltinToolFunction;

/**
 * Denial reason for a call gated after the drive's abort signal fired.
 */
const stoppedReason = 'This call was not run because the drive stopped.';

/**
 * Outcome report of an approved call, queued by the adapter-facing methods and
 * consumed in order by the call's effect attempt.
 */
type GateReport =
  | {
      /**
       * Reports a partial value.
       */
      type: 'partial';

      /**
       * Complete partial value of the call.
       */
      value: HarnessV2ToolExecutionValue;

      /**
       * Resolves the reporting `partial()` call once the value is committed.
       */
      committed: () => void;
    }
  | {
      /**
       * Ends the call with a result.
       */
      type: 'result';

      /**
       * Final value of the call.
       */
      value: HarnessV2ToolExecutionValue;
    }
  | {
      /**
       * Ends the call with an error.
       */
      type: 'error';

      /**
       * Failure the runtime reported.
       */
      error: HarnessV2EffectError;
    };

/**
 * Returns the built-in tool registered under the name as an own property, if
 * any.
 */
function getTool(options: {
  /**
   * The harness's built-in tools.
   */
  builtinTools: ToolSet;

  /**
   * Name of the tool to look up.
   */
  toolName: string;
}): Tool | undefined {
  return Object.hasOwn(options.builtinTools, options.toolName)
    ? options.builtinTools[options.toolName]
    : undefined;
}

/**
 * Formats a recorded tool value for a denial reason, using its `raw` value
 * when it has the shape of a tool execution value.
 */
function formatRecordedValue(options: {
  /**
   * Recorded value of a result or partial.
   */
  value: unknown;
}): string {
  const { value } = options;
  const raw =
    value != null && typeof value === 'object' && Object.hasOwn(value, 'raw')
      ? value.raw
      : value;
  try {
    return JSON.stringify(raw) ?? 'null';
  } catch {
    return String(raw);
  }
}

/**
 * Returns the denial reason for a call whose effect returned a recorded output
 * instead of starting an attempt: a result, an error, or an interruption that
 * is not retryable.
 */
function getRecordedReason(options: {
  /**
   * Recorded output of the call's effect.
   */
  output: HarnessV2EffectOutput;
}): string {
  const { output } = options;
  if (output.type === 'interrupted') {
    const reason =
      'This call was interrupted in an earlier attempt and may or may not have taken effect.';
    return Object.hasOwn(output, 'partial')
      ? `${reason}\nPartial output before the interruption: ${formatRecordedValue({ value: output.partial })}`
      : reason;
  }
  const recorded =
    output.type === 'result'
      ? formatRecordedValue({ value: output.value })
      : output.error.message;
  return `This call already ran in this session. Its recorded result: ${recorded}`;
}

/**
 * Rejects a reported value that cannot be recorded as a tool value.
 */
function validateValue(options: {
  /**
   * Reported partial or final value.
   */
  value: HarnessV2ToolExecutionValue;
}): void {
  const { value } = options;
  if (!isPlainJSONValue({ value: value.raw })) {
    throw new Error(
      'HarnessAgent.gateBuiltinTool: `raw` must be a JSON value.',
    );
  }
  if (
    value.modelOutput !== undefined &&
    !isSerializableValue(value.modelOutput)
  ) {
    throw new Error(
      'HarnessAgent.gateBuiltinTool: `modelOutput` must be serializable.',
    );
  }
}

/**
 * Emits a `tool-result` part attributed to an effect attempt.
 */
function emitToolResult(options: {
  /**
   * Context of the attempt that produced the part.
   */
  context: HarnessV2EffectContext;

  /**
   * ID of the tool call.
   */
  toolCallId: string;

  /**
   * Name of the called tool.
   */
  toolName: string;

  /**
   * JSON result or error message.
   */
  result: JSONValue;

  /**
   * Whether the part reports an error.
   */
  isError?: boolean;

  /**
   * Whether the part is a preliminary result.
   */
  preliminary?: boolean;
}): void {
  const { context, toolCallId, toolName, result, isError, preliminary } =
    options;
  const part: HarnessV2ToolResult = {
    type: 'tool-result',
    toolCallId,
    toolName,
    result,
  };
  if (isError) part.isError = true;
  if (preliminary) part.preliminary = true;
  context.emit(part);
}

/**
 * Creates the drive context's `gateBuiltinTool()` for one drive.
 *
 * Each call is recorded as the effect `tool:${toolCallId}` named
 * `tool.${toolName}`, with the built-in tool's `replay` policy (`'never'` when
 * omitted). Unlike host tools, the effect stays open across the runtime's
 * permission point and its report of the outcome: the call resolves
 * `approved` as soon as the attempt's start and its `tool-execution-start`
 * event are committed, and the attempt then waits for the adapter's
 * `partial()`, `result()` or `error()` reports,
 * processed in order. Each report emits its `tool-result` part through the
 * attempt's `emit()` and is recorded as the attempt's progress or end, so
 * readers can retract the parts of an interrupted attempt and a replay emits
 * nothing again. When the drive's abort signal fires before the call ended,
 * the attempt is recorded as `interrupted`, with the last committed partial.
 *
 * A call is `denied` without running when:
 * - the drive's abort signal already fired (nothing is recorded);
 * - its effect returns a recorded output instead of starting an attempt, i.e.
 *   a result, an error, or an interruption that is not retryable;
 * - the tool is not one of the harness's built-in tools: the call is recorded
 *   as an `error`, so a replay is denied the same way.
 *
 * A recorded retryable interruption (a `replay: 'safe'` tool, or an attempt
 * that a crashed drive left before its `tool-execution-start` committed) lets
 * the effect start a new attempt, so a call the runtime dispatches again is
 * approved again, the same as a host tool call.
 *
 * Input that is not a JSON value rejects without recording, since only an
 * adapter bug can produce it. Concurrent calls with the same `toolCallId`
 * reject through `effect()`, and so does an unfinished attempt that requires
 * recovery. The returned methods reject if recording the call failed after
 * it was approved; a failure nobody observes is not reported further.
 */
export function createGateBuiltinToolFunction(options: {
  /**
   * Engine log of the session, used to record `tool-execution-start` events.
   */
  log: HarnessAgentLog;

  /**
   * The harness's built-in tools.
   */
  builtinTools: ToolSet;

  /**
   * Effect function of the current drive.
   */
  effect: HarnessAgentEffectFunction;

  /**
   * Abort signal of the drive that owns this function.
   */
  abortSignal: AbortSignal;
}): HarnessAgentGateBuiltinToolFunction {
  const { log, builtinTools, effect, abortSignal } = options;

  /**
   * Records a call to a tool that is not a built-in tool as an `error` effect
   * and denies it with the error message, or with the recorded output's reason
   * if the effect was recorded elsewhere first.
   */
  async function denyUnknownTool(options: {
    /**
     * ID of the tool call.
     */
    toolCallId: string;

    /**
     * Name of the called tool.
     */
    toolName: string;

    /**
     * Tool input, already parsed from the model's JSON.
     */
    input: JSONValue;
  }): Promise<HarnessV2ToolGateOutput> {
    const { toolCallId, toolName, input } = options;
    let ran = false;
    const output = await effect({
      key: `tool:${toolCallId}`,
      name: `tool.${toolName}`,
      replay: 'never',
      input,
      fn: async context => {
        ran = true;
        const error = new NoSuchToolError({
          toolName,
          availableTools: Object.keys(builtinTools),
        });
        if (!context.abortSignal.aborted) {
          emitToolResult({
            context,
            toolCallId,
            toolName,
            result: getErrorMessage(error),
            isError: true,
          });
        }
        throw error;
      },
    });
    if (ran && output.type === 'error') {
      return { type: 'denied', reason: output.error.message };
    }
    return {
      type: 'denied',
      reason: abortSignal.aborted
        ? stoppedReason
        : getRecordedReason({ output }),
    };
  }

  /**
   * Starts the effect of a built-in tool call and resolves `approved` once its
   * attempt runs, which implies its start is committed. If the effect settles
   * without running an attempt, the call is denied instead.
   */
  async function startBuiltinTool(options: {
    /**
     * ID of the tool call.
     */
    toolCallId: string;

    /**
     * Name of the called tool.
     */
    toolName: string;

    /**
     * Tool input, already parsed from the model's JSON.
     */
    input: JSONValue;

    /**
     * The called built-in tool.
     */
    tool: Tool;
  }): Promise<HarnessV2ToolGateOutput> {
    const { toolCallId, toolName, input, tool } = options;
    const reports: GateReport[] = [];
    let wake: (() => void) | undefined;
    let ended = false;
    let effectSettled = false;
    let markStarted!: () => void;
    const started = new Promise<void>(resolve => {
      markStarted = resolve;
    });

    /**
     * Queues a report and wakes the attempt if it is waiting for one.
     */
    function enqueue(report: GateReport): void {
      reports.push(report);
      const wakeAttempt = wake;
      wake = undefined;
      wakeAttempt?.();
    }

    /**
     * Resolves with the next queued report, waiting for one if needed. Throws
     * the abort reason once the attempt's signal fired, so the effect records
     * the attempt as interrupted.
     */
    async function nextReport(
      context: HarnessV2EffectContext,
    ): Promise<GateReport> {
      for (;;) {
        if (context.abortSignal.aborted) throw context.abortSignal.reason;
        const report = reports.shift();
        if (report != null) return report;
        await new Promise<void>(resolve => {
          const onAbort = () => {
            wake = undefined;
            resolve();
          };
          context.abortSignal.addEventListener('abort', onAbort, {
            once: true,
          });
          wake = () => {
            context.abortSignal.removeEventListener('abort', onAbort);
            resolve();
          };
        });
      }
    }

    /**
     * Runs the call's attempt: commits its `tool-execution-start` event and
     * signals that the call is approved, then records and emits the
     * adapter's reports in order until the call ended.
     *
     * @yields Each partial value, then the final value. The effect commits
     * every yielded value before resuming, so a `partial()` call resolves
     * right after its `yield`.
     */
    async function* runAttempt(
      context: HarnessV2EffectContext,
    ): AsyncGenerator<SerializableValue> {
      /*
       * TODO: Revisit this marker. It commits before the gate approves the
       * call, but the adapter may still crash after the approval and before
       * its runtime starts the tool. Recovery then treats an attempt whose
       * tool never ran as possibly executed, so a `replay: 'never'` tool is
       * not retried.
       */
      await log.append({
        type: 'tool-execution-start',
        id: `tool-execution-start:${context.startId}`,
        data: { startId: context.startId },
      });
      markStarted();
      for (;;) {
        const report = await nextReport(context);
        if (report.type === 'error') {
          emitToolResult({
            context,
            toolCallId,
            toolName,
            result: report.error.message,
            isError: true,
          });
          throw new HarnessEffectError(report.error);
        }

        emitToolResult({
          context,
          toolCallId,
          toolName,
          result: report.value.raw,
          preliminary: report.type === 'partial',
        });
        /*
         * The cast is needed because `ToolResultOutput` contains interfaces,
         * which TypeScript never treats as `SerializableValue`; the value was
         * verified to be serializable when it was reported.
         */
        yield report.value as SerializableValue;
        if (report.type === 'result') return;
        report.committed();
      }
    }

    const done = effect({
      key: `tool:${toolCallId}`,
      name: `tool.${toolName}`,
      replay: tool.replay ?? 'never',
      input,
      fn: runAttempt,
    });
    const settled = done.then(() => undefined);
    void settled
      .catch(() => {})
      .finally(() => {
        effectSettled = true;
      });

    const first = await Promise.race([
      started.then(() => 'started' as const),
      done.then(() => 'settled' as const),
    ]);
    if (first === 'settled') {
      const output = await done;
      return {
        type: 'denied',
        reason: abortSignal.aborted
          ? stoppedReason
          : getRecordedReason({ output }),
      };
    }

    return {
      type: 'approved',
      async partial(value) {
        if (ended || effectSettled) return settled;
        validateValue({ value });
        return new Promise<void>((resolve, reject) => {
          enqueue({ type: 'partial', value, committed: resolve });
          settled.then(resolve).catch(reject);
        });
      },
      async result(value) {
        if (ended || effectSettled) return settled;
        validateValue({ value });
        ended = true;
        enqueue({ type: 'result', value });
        return settled;
      },
      async error(error) {
        if (ended || effectSettled) return settled;
        ended = true;
        enqueue({ type: 'error', error });
        return settled;
      },
    };
  }

  return async function gateBuiltinTool(call: {
    toolCallId: string;
    toolName: string;
    input: JSONValue;
  }): Promise<HarnessV2ToolGateOutput> {
    const { toolCallId, toolName, input } = call;

    /*
     * `input` is typed `JSONValue`, but adapters often hold runtime payloads
     * typed `any` (e.g. from `JSON.parse`), which bypass the type. Rejecting
     * them here reports the contract violation clearly instead of failing
     * later while recording the effect.
     */
    if (!isPlainJSONValue({ value: input })) {
      throw new Error(
        'HarnessAgent.gateBuiltinTool: `input` must be a JSON value.',
      );
    }
    if (abortSignal.aborted) return { type: 'denied', reason: stoppedReason };

    const tool = getTool({ builtinTools, toolName });
    if (tool == null) return denyUnknownTool({ toolCallId, toolName, input });
    return startBuiltinTool({ toolCallId, toolName, input, tool });
  };
}
