import type { SerializableValue } from '@ai-sdk/provider';
import {
  cloneSerializableValue,
  generateId,
  getErrorMessage,
  jsonDecodeSerializableValue,
  jsonEncodeSerializableValue,
} from '@ai-sdk/provider-utils';
import { HarnessCancellationError } from '../../../errors/harness-cancellation-error';
import { HarnessEffectError } from '../../../errors/harness-effect-error';
import { HarnessInvalidDriveStateError } from '../../../errors/harness-invalid-drive-state-error';
import type {
  HarnessV2EffectFunction,
  HarnessV2EffectOptions,
} from '../../../v2/harness-v2-drive-context';
import type {
  HarnessV2EffectContext,
  HarnessV2EffectOutput,
} from '../../../v2/harness-v2-effect';
import type {
  HarnessAgentLog,
  HarnessAgentLogEffectAttempt,
  HarnessAgentLogEffectProgressEvent,
  HarnessAgentLogEffectStartEvent,
} from './create-log';
import type { HarnessAgentStreamWriter } from './create-stream-writer';

/**
 * Options of one `effect()` call. Same as `HarnessV2EffectOptions`, redeclared
 * so the engine does not depend on the adapter-facing type.
 */
export type HarnessAgentEffectOptions<
  T extends SerializableValue = SerializableValue,
> = HarnessV2EffectOptions<T>;

/**
 * Runs a keyed effect and returns its committed output. Terminal outputs are
 * replayed; recorded retryable interruptions permit a new attempt. Callback
 * failures become error outputs, except a thrown `HarnessCancellationError`,
 * which becomes an interruption. Persistence failures reject the call.
 */
export type HarnessAgentEffectFunction = HarnessV2EffectFunction;

/**
 * Callback outcome and an optional drive-rebuild error to propagate after
 * recording the attempt's interruption.
 */
type CallbackOutput = {
  /**
   * Result, serialized callback error, or interruption to commit.
   */
  output: HarnessV2EffectOutput;
  /**
   * Original control-flow error that must not become an effect error output.
   */
  invalidDriveStateError?: HarnessInvalidDriveStateError;
};

/**
 * Returns whether a recorded interruption permits a subsequent attempt. The
 * recorded `retryable` flag decides: interruptions this function records are
 * retryable only for `replay: 'safe'`, while recovery also records an
 * abandoned tool attempt that provably never ran its tool as retryable.
 */
function canRetry(attempt: HarnessAgentLogEffectAttempt): boolean {
  const output = attempt.end?.data.output;
  return output?.type === 'interrupted' && output.retryable;
}

/**
 * Builds an interruption from the attempt's replay policy and committed
 * progress. Progress presence is independent of whether its value is undefined.
 */
function interruption(
  attempt: HarnessAgentLogEffectAttempt,
): HarnessV2EffectOutput {
  const retryable = attempt.start.data.replay === 'safe';
  if (attempt.progress) {
    return {
      type: 'interrupted',
      retryable,
      partial: attempt.progress.data.partial,
    };
  }
  return { type: 'interrupted', retryable };
}

/**
 * Invokes a callback or iterates its yielded values with durable progress
 * backpressure. Cancellation is cooperative: pending callback work must settle
 * before an interruption can be recorded. Persistence is deliberately outside
 * callback error handlers so infrastructure failures cannot become effect errors.
 */
async function executeCallback(options: {
  /**
   * Authoritative session log.
   */
  log: HarnessAgentLog;
  /**
   * Signal passed to the callback and checked between iteration operations.
   */
  abortSignal: AbortSignal;
  /**
   * Accepted attempt whose progress is being recorded. The log updates it as
   * its progress commits.
   */
  attempt: HarnessAgentLogEffectAttempt;
  /**
   * Emit function passed to the callback, bound to this attempt.
   */
  emit: HarnessV2EffectContext['emit'];
  /**
   * Work to execute once its start has committed.
   */
  fn: (
    context: HarnessV2EffectContext,
  ) => PromiseLike<SerializableValue> | AsyncIterable<SerializableValue>;
}): Promise<CallbackOutput> {
  const { log, abortSignal, attempt, emit, fn } = options;

  /**
   * Separates drive-rebuild errors and cancellation from ordinary callback
   * failures. The caller persists the output before propagating a rebuild error.
   * A thrown `HarnessEffectError` is the throwable form of effect error data,
   * so its message is recorded unchanged instead of the error's string form.
   * A thrown `HarnessCancellationError` means the adapter stopped the work
   * because the user cancelled the turn, so it is recorded as an
   * interruption.
   */
  function callbackFailure(error: unknown): CallbackOutput {
    if (HarnessInvalidDriveStateError.isInstance(error)) {
      return {
        output: interruption(attempt),
        invalidDriveStateError: error,
      };
    }
    if (HarnessCancellationError.isInstance(error)) {
      return { output: interruption(attempt) };
    }
    if (abortSignal.aborted) return { output: interruption(attempt) };
    if (HarnessEffectError.isInstance(error)) {
      return { output: { type: 'error', error: { message: error.message } } };
    }
    let message: string;
    try {
      message = getErrorMessage(error) ?? String(error);
    } catch {
      message = 'Unknown effect error';
    }
    return { output: { type: 'error', error: { message } } };
  }

  if (abortSignal.aborted) return { output: interruption(attempt) };

  let result: ReturnType<typeof fn>;
  let pending: PromiseLike<SerializableValue> | undefined;
  let iterator: AsyncIterator<SerializableValue> | undefined;
  try {
    result = fn({ abortSignal, startId: attempt.start.id, emit });
    if (Symbol.asyncIterator in result)
      iterator = result[Symbol.asyncIterator]();
    else pending = result;
  } catch (error) {
    return callbackFailure(error);
  }

  if (iterator == null) {
    let value: SerializableValue;
    try {
      value = await pending;
    } catch (error) {
      return callbackFailure(error);
    }
    return {
      output: abortSignal.aborted
        ? interruption(attempt)
        : { type: 'result', value },
    };
  }

  let done = false;
  let lastValue: SerializableValue;
  try {
    for (;;) {
      if (abortSignal.aborted) return { output: interruption(attempt) };
      let next: IteratorResult<SerializableValue>;
      try {
        next = await iterator.next();
      } catch (error) {
        return callbackFailure(error);
      }
      done = next.done === true;
      if (abortSignal.aborted) return { output: interruption(attempt) };
      if (done) return { output: { type: 'result', value: lastValue } };

      const partial = jsonDecodeSerializableValue({
        value: jsonEncodeSerializableValue({ value: next.value }),
      });
      const progress: HarnessAgentLogEffectProgressEvent = {
        type: 'effect-progress',
        id: generateId(),
        data: { startId: attempt.start.id, partial },
      };
      await log.append(progress);
      lastValue = partial;
    }
  } finally {
    if (!done) {
      try {
        await iterator.return?.();
      } catch {}
    }
  }
}

/**
 * Creates a replay-aware effect function for one session drive. Starts and
 * outputs are confirmed committed before execution and return respectively.
 * Unfinished attempts require engine recovery, not an automatic retry here.
 * Cancellation is cooperative; callback rebuild errors record interruption
 * before propagating, while serialization and persistence failures reject.
 * A `HarnessCancellationError` thrown by a callback records an interruption
 * (retryable for `replay: 'safe'`, with the last partial output), and the
 * call resolves with it.
 * Attempts and turns are looked up in the log, which the drive refreshes when
 * it starts and which every append brings up to date before writing.
 * Each executed attempt's callback emits through the stream writer, tagged with
 * its start ID; the writer is flushed before the attempt's end is committed.
 *
 * Once `yieldAbortSignal` fired, no new attempt starts: the call
 * returns `{ type: 'interrupted', retryable: true }` without recording
 * anything, since nothing ran. Recorded terminal outputs still replay.
 *
 * Turns start here: before appending a new attempt's `effect-start`, a
 * delivered `prompt` submission without a `turn-start` event gets one (ID
 * `turn-start:${submissionId}`), and the `start-turn` stream part is emitted under
 * that key if the append was new. The turn therefore starts before the first
 * effect that hands its prompt to the model. Steer submissions and unknown
 * submission IDs never start a turn.
 *
 * Only one turn runs at a time: a prompt submitted while a turn is running
 * waits until that turn finished. A new attempt therefore rejects with
 * `HarnessInvalidDriveStateError`, without writing anything, if it delivers
 * more than one prompt that has not started a turn, or a prompt while the
 * latest turn has not finished.
 */
export function createEffectFunction(options: {
  /**
   * Authoritative log shared by the session's drive attempts.
   */
  log: HarnessAgentLog;
  /**
   * Signal of the drive asking it to stop at once, passed unchanged to
   * callbacks as their `abortSignal`.
   */
  stopAbortSignal: AbortSignal;
  /**
   * Signal of the drive asking it to stop at the next safe point. Once it
   * fired, no new attempt starts.
   */
  yieldAbortSignal: AbortSignal;
  /**
   * Writer for the session's stream, used by each attempt's `emit`.
   */
  writer: HarnessAgentStreamWriter;
}): HarnessAgentEffectFunction {
  const { log, stopAbortSignal, yieldAbortSignal, writer } = options;

  /**
   * Effect keys with active invocations in this drive, including persistence.
   * Prevents overlapping calls for the same key.
   */
  const running = new Set<string>();

  /**
   * Submission ID of the turn whose `turn-start` event is being appended by
   * this effect function, until that append settled. Counts as an unfinished
   * turn, so a concurrent effect cannot start another turn meanwhile.
   */
  let startingTurn: string | undefined;

  /**
   * Records an outcome only for an accepted, unfinished attempt and returns its
   * canonical output. A competing end that committed first remains authoritative.
   * The drive signal is checked against the logged attempt before submitting an end.
   * Storage and serialization failures propagate without rerunning the callback.
   */
  async function finishAttempt(options: {
    /**
     * Key of the effect.
     */
    key: string;
    /**
     * Identity of the attempt being completed.
     */
    startId: string;
    /**
     * Locally observed callback outcome.
     */
    output: HarnessV2EffectOutput;
  }): Promise<HarnessV2EffectOutput> {
    const attempt = log.getEffect({ key: options.key });
    if (attempt?.start.id !== options.startId) {
      throw new HarnessInvalidDriveStateError({
        message: 'HarnessAgent.effect: the effect start was not accepted.',
      });
    }
    if (attempt.end != null) return attempt.end.data.output;
    await log.append({
      type: 'effect-end',
      id: generateId(),
      data: {
        startId: options.startId,
        output:
          options.output.type === 'interrupted' || stopAbortSignal.aborted
            ? interruption(attempt)
            : options.output,
      },
    });
    const ended = log.getEffect({ key: options.key });
    if (ended?.start.id !== options.startId || ended.end == null) {
      throw new HarnessInvalidDriveStateError({
        message: 'HarnessAgent.effect: the effect end was not accepted.',
      });
    }
    return ended.end.data.output;
  }

  /**
   * Starts the turn of the `prompt` submission among the given ones that has
   * no `turn-start` event yet, if there is one. Appends are first-wins, so a
   * turn whose start another drive already committed is not started again,
   * and the `start-turn` part is only emitted for a new append.
   *
   * A session runs one turn at a time, and each turn starts with exactly one
   * prompt; prompts submitted meanwhile wait until the turn finished. So this
   * rejects with `HarnessInvalidDriveStateError`, before writing anything, if
   * the given submissions include more than one prompt without a turn, or if
   * the latest turn has not finished yet.
   */
  async function maybeStartTurn(options: {
    /**
     * Submissions delivered by the attempt about to start.
     */
    submissionIds: readonly string[];
  }): Promise<void> {
    const prompts = new Set(
      log
        .getSubmissions()
        .filter(submission => submission.data.type === 'prompt')
        .map(submission => submission.id),
    );
    const startedPrompts = new Set(
      log
        .getTurns()
        .flatMap(turn => turn.submissions.map(submission => submission.id)),
    );
    const waiting = options.submissionIds.filter(
      submissionId =>
        prompts.has(submissionId) && !startedPrompts.has(submissionId),
    );
    if (waiting.length === 0) return;
    if (waiting.length > 1) {
      throw new HarnessInvalidDriveStateError({
        message:
          'HarnessAgent.effect: an effect can start at most one turn, but it delivers more than one prompt that has not started a turn.',
      });
    }
    const currentTurn = log.getCurrentTurn();
    if (
      startingTurn != null ||
      (currentTurn != null && currentTurn.finish == null)
    ) {
      throw new HarnessInvalidDriveStateError({
        message:
          'HarnessAgent.effect: a prompt cannot start a turn while the previous turn has not finished.',
      });
    }

    const [submissionId] = waiting;
    const id = `turn-start:${submissionId}`;
    startingTurn = submissionId;
    try {
      const appended = await log.append({
        type: 'turn-start',
        id,
        data: { turnId: submissionId },
      });
      if (appended) writer.emit({ part: { type: 'start-turn' }, key: id });
    } finally {
      startingTurn = undefined;
    }
  }

  /**
   * Replays a terminal output or executes the winning new attempt. Concurrent
   * calls for the same key cannot run another callback in this drive.
   */
  return async function effect<T extends SerializableValue = SerializableValue>(
    options: HarnessAgentEffectOptions<T>,
  ): Promise<HarnessV2EffectOutput<T>> {
    const { key, fn } = options;
    if (running.has(key)) {
      throw new HarnessInvalidDriveStateError({
        message: 'HarnessAgent.effect: the effect is already running.',
      });
    }
    running.add(key);
    try {
      const previous = log.getEffect({ key });
      if (previous?.end != null && !canRetry(previous)) {
        return cloneSerializableValue({
          value: previous.end.data.output,
        }) as HarnessV2EffectOutput<T>;
      }
      if (stopAbortSignal.aborted) {
        return { type: 'interrupted', retryable: options.replay === 'safe' };
      }
      if (previous != null && !canRetry(previous)) {
        throw new HarnessInvalidDriveStateError({
          message:
            'HarnessAgent.effect: the unfinished attempt requires recovery.',
        });
      }
      if (yieldAbortSignal.aborted) {
        return { type: 'interrupted', retryable: true };
      }

      const start: HarnessAgentLogEffectStartEvent = {
        type: 'effect-start',
        id: generateId(),
        data: {
          key,
          attempt: (previous?.start.data.attempt ?? 0) + 1,
          name: options.name,
          replay: options.replay,
          input: options.input,
          deliveredSubmissionIds: options.deliveredSubmissionIds?.length
            ? options.deliveredSubmissionIds
            : (previous?.start.data.deliveredSubmissionIds ?? []),
        },
      };
      await maybeStartTurn({
        submissionIds: start.data.deliveredSubmissionIds,
      });
      await log.append(start);
      const attempt = log.getEffect({ key });
      if (attempt?.start.id !== start.id) {
        if (attempt?.end != null && !canRetry(attempt)) {
          return cloneSerializableValue({
            value: attempt.end.data.output,
          }) as HarnessV2EffectOutput<T>;
        }
        throw new HarnessInvalidDriveStateError({
          message: 'HarnessAgent.effect: another effect start was accepted.',
        });
      }
      if (attempt.end != null) {
        return cloneSerializableValue({
          value: attempt.end.data.output,
        }) as HarnessV2EffectOutput<T>;
      }

      /*
       * Parts are tagged with the attempt that produced them, so readers can
       * retract them if the attempt is interrupted. Emits after the callback
       * settled are dropped, and the writer is flushed before the end commits:
       * a committed end therefore implies the attempt's parts were written or
       * failed, never still buffered in a process that may die.
       */
      let emitting = true;
      let result: CallbackOutput;
      try {
        result = await executeCallback({
          log,
          abortSignal: stopAbortSignal,
          attempt,
          emit: part => {
            if (emitting) writer.emit({ part, startId: start.id });
          },
          fn,
        });
      } finally {
        emitting = false;
      }
      await writer.flush();
      const output = await finishAttempt({
        key,
        startId: start.id,
        output: result.output,
      });
      if (result.invalidDriveStateError != null) {
        throw result.invalidDriveStateError;
      }
      return cloneSerializableValue({
        value: output,
      }) as HarnessV2EffectOutput<T>;
    } finally {
      running.delete(key);
    }
  };
}
