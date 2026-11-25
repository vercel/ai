import type { SerializableValue } from '@ai-sdk/provider';
import {
  cloneSerializableValue,
  generateId,
  getErrorMessage,
  jsonDecodeSerializableValue,
  jsonEncodeSerializableValue,
} from '@ai-sdk/provider-utils';
import { HarnessAdapterContractError } from '../../../errors/harness-adapter-contract-error';
import { HarnessCancellationError } from '../../../errors/harness-cancellation-error';
import { HarnessEffectError } from '../../../errors/harness-effect-error';
import { HarnessInvalidDriveStateError } from '../../../errors/harness-invalid-drive-state-error';
import type { HarnessV2EffectOptions } from '../../../v2/harness-v2-drive-context';
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
import type {
  HarnessAgentStreamPart,
  HarnessAgentStreamWriter,
} from './create-stream-writer';

/**
 * Context passed to an effect callback. Same as `HarnessV2EffectContext`,
 * except that `emit()` accepts every `HarnessAgentStreamPart`, so the engine
 * can emit parts a harness never emits, such as `tool-result`.
 */
export type HarnessAgentEffectContext = Omit<HarnessV2EffectContext, 'emit'> & {
  /**
   * Emits a stream part produced by this attempt to the agent's output.
   */
  emit(part: HarnessAgentStreamPart): void;
};

/**
 * Options of one `effect()` call. Same as `HarnessV2EffectOptions`, except
 * that the callback receives a `HarnessAgentEffectContext`.
 */
export type HarnessAgentEffectOptions<
  T extends SerializableValue = SerializableValue,
> = Omit<HarnessV2EffectOptions<T>, 'fn'> & {
  /**
   * Work to run for a new attempt.
   */
  fn: (context: HarnessAgentEffectContext) => PromiseLike<T> | AsyncIterable<T>;
};

/**
 * Runs a keyed effect and returns its committed output. Terminal outputs are
 * replayed; recorded retryable interruptions permit a new attempt. Callback
 * failures become error outputs, except a thrown `HarnessCancellationError`,
 * which becomes an interruption. Persistence failures reject the call.
 *
 * Assignable to `HarnessV2EffectFunction`, so the drive context exposes it to
 * a harness with the narrower `HarnessV2EffectContext`.
 */
export type HarnessAgentEffectFunction = <
  T extends SerializableValue = SerializableValue,
>(
  options: HarnessAgentEffectOptions<T>,
) => Promise<HarnessV2EffectOutput<T>>;

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
   * Original drive-level error that must not become an effect error output.
   */
  propagateError?: HarnessInvalidDriveStateError | HarnessAdapterContractError;
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
  emit: HarnessAgentEffectContext['emit'];
  /**
   * Work to execute once its start has committed.
   */
  fn: (
    context: HarnessAgentEffectContext,
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
    if (
      HarnessInvalidDriveStateError.isInstance(error) ||
      HarnessAdapterContractError.isInstance(error)
    ) {
      return {
        output: interruption(attempt),
        propagateError: error,
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
 * Turns start here: before appending a new attempt's `effect-start`, any
 * delivered `prompt` submissions without a `turn-start` event start a single
 * turn together (`turn-start:${turnId}` with an opaque generated `turnId` and
 * their `submissionIds` in log order), and the `start-turn` stream part is
 * emitted under that key if the append was accepted. The turn therefore starts
 * before the first effect that hands its prompts to the model. Steer
 * submissions and unknown submission IDs never start a turn.
 *
 * Only one turn runs at a time: a prompt submitted while a turn is running
 * waits until that turn finished. A new attempt therefore rejects with
 * `HarnessAdapterContractError`, without writing anything, if it delivers a
 * prompt that has not started a turn while the latest turn has not finished.
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
   * Whether a `turn-start` event is currently being appended by this effect
   * function, until that append settles. Counts as an unfinished turn, so a
   * concurrent effect cannot start another turn meanwhile.
   */
  let startingTurn = false;

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
   * Starts a single turn for all `prompt` submissions among the given ones
   * that have no `turn-start` event yet, ordered by their position in the log.
   * Appends are first-wins, so a turn whose start another drive already
   * committed is not started again, and the `start-turn` part is only emitted
   * when this append became the current turn.
   *
   * A session runs one turn at a time: prompts submitted meanwhile wait until
   * the turn finished. So this rejects with `HarnessAdapterContractError`,
   * before writing anything, if the given submissions include any prompt
   * without a turn while the latest turn has not finished yet.
   */
  async function maybeStartTurn(options: {
    /**
     * Submissions delivered by the attempt about to start.
     */
    submissionIds: readonly string[];
  }): Promise<void> {
    const requested = new Set(options.submissionIds);
    const startedPrompts = new Set(
      log
        .getTurns()
        .flatMap(turn => turn.submissions.map(submission => submission.id)),
    );
    const waiting = log
      .getSubmissions()
      .filter(
        submission =>
          submission.data.type === 'prompt' &&
          requested.has(submission.id) &&
          !startedPrompts.has(submission.id),
      )
      .map(submission => submission.id);
    if (waiting.length === 0) return;
    const currentTurn = log.getCurrentTurn();
    if (startingTurn || (currentTurn != null && currentTurn.finish == null)) {
      throw new HarnessAdapterContractError({
        message:
          'HarnessAgent.effect: a prompt cannot start a turn while the previous turn has not finished.',
      });
    }

    const turnId = generateId();
    const id = `turn-start:${turnId}`;
    startingTurn = true;
    try {
      const appended = await log.append({
        type: 'turn-start',
        id,
        data: { turnId, submissionIds: waiting },
      });
      if (appended && log.getCurrentTurn()?.start.data.turnId === turnId) {
        writer.emit({
          part: { type: 'start-turn', submissionIds: waiting },
          key: id,
        });
      }
    } finally {
      startingTurn = false;
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
      throw new HarnessAdapterContractError({
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
      if (result.propagateError != null) {
        throw result.propagateError;
      }
      return cloneSerializableValue({
        value: output,
      }) as HarnessV2EffectOutput<T>;
    } finally {
      running.delete(key);
    }
  };
}
