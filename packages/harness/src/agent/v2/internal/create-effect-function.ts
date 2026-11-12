import type { SerializableValue } from '@ai-sdk/provider';
import {
  cloneSerializableValue,
  generateId,
  getErrorMessage,
  jsonDecodeSerializableValue,
  jsonEncodeSerializableValue,
} from '@ai-sdk/provider-utils';
import { HarnessEffectError } from '../../../errors/harness-effect-error';
import { HarnessInvalidDriveStateError } from '../../../errors/harness-invalid-drive-state-error';
import type {
  HarnessV2EffectContext,
  HarnessV2EffectOutput,
} from '../../../v2/harness-v2-effect';
import type {
  HarnessAgentEffectFunction,
  HarnessAgentEffectOptions,
  HarnessAgentLog,
  HarnessAgentLogEvent,
  HarnessAgentStreamWriter,
} from './types';

/**
 * Log event types the effect function reads. Effect events tell it which
 * effects ran and what they returned; submissions, turn starts and turn
 * finishes tell it which prompts exist, which of them already started a turn,
 * and whether the latest turn finished. It ignores all other types.
 */
const effectEventTypes: HarnessAgentLogEvent['type'][] = [
  'submission',
  'turn-start',
  'finish-turn',
  'effect-start',
  'effect-progress',
  'effect-end',
];

/**
 * One accepted effect attempt reconstructed from committed log events.
 */
type EffectRecord = {
  /**
   * Start event containing the effect definition and attempt identity.
   */
  start: Extract<
    HarnessAgentLogEvent,
    {
      /**
       * Identifies a start event.
       */
      type: 'effect-start';
    }
  >;
  /**
   * Latest committed progress, including an explicitly yielded undefined.
   */
  progress?: Extract<
    HarnessAgentLogEvent,
    {
      /**
       * Identifies a progress event.
       */
      type: 'effect-progress';
    }
  >;
  /**
   * First committed end output, absent while the attempt is unfinished.
   */
  output?: HarnessV2EffectOutput;
};

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
 * Returns whether a recorded interruption permits a subsequent attempt.
 */
function canRetry(attempt: EffectRecord): boolean {
  return (
    attempt.start.data.replay === 'safe' &&
    attempt.output?.type === 'interrupted' &&
    attempt.output.retryable
  );
}

/**
 * Builds an interruption from the attempt's replay policy and committed
 * progress. Progress presence is independent of whether its value is undefined.
 */
function interruption(attempt: EffectRecord): HarnessV2EffectOutput {
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
   * Accepted attempt whose progress is being recorded.
   */
  attempt: EffectRecord;
  /**
   * Emit function passed to the callback, bound to this attempt.
   */
  emit: HarnessV2EffectContext['emit'];
  /**
   * Throws if the effect records could not be updated from a committed event,
   * so a callback never runs based on incomplete records.
   */
  checkState: () => void;
  /**
   * Work to execute once its start has committed.
   */
  fn: (
    context: HarnessV2EffectContext,
  ) => PromiseLike<SerializableValue> | AsyncIterable<SerializableValue>;
}): Promise<CallbackOutput> {
  const { log, abortSignal, attempt, emit, checkState, fn } = options;

  /**
   * Separates drive-rebuild errors and cancellation from ordinary callback
   * failures. The caller persists the output before propagating a rebuild error.
   * A thrown `HarnessEffectError` is the throwable form of effect error data,
   * so its message is recorded unchanged instead of the error's string form.
   */
  function callbackFailure(error: unknown): CallbackOutput {
    checkState();
    if (HarnessInvalidDriveStateError.isInstance(error)) {
      return {
        output: interruption(attempt),
        invalidDriveStateError: error,
      };
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

  checkState();
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
    checkState();
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
      checkState();
      if (abortSignal.aborted) return { output: interruption(attempt) };
      let next: IteratorResult<SerializableValue>;
      try {
        next = await iterator.next();
      } catch (error) {
        return callbackFailure(error);
      }
      done = next.done === true;
      checkState();
      if (abortSignal.aborted) return { output: interruption(attempt) };
      if (done) return { output: { type: 'result', value: lastValue } };

      const partial = jsonDecodeSerializableValue({
        value: jsonEncodeSerializableValue({ value: next.value }),
      });
      const progress: NonNullable<EffectRecord['progress']> = {
        type: 'effect-progress',
        id: generateId(),
        data: { startId: attempt.start.id, partial },
      };
      await log.append(progress);
      checkState();
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
 * Records are reconstructed once and updated by a log subscription. The caller
 * must abort `stopAbortSignal` when the drive ends to release that subscription;
 * active effects retain it until their interruption persistence has settled.
 * Each executed attempt's callback emits through the stream writer, tagged with
 * its start ID; the writer is flushed before the attempt's end is committed.
 *
 * Once `yieldAbortSignal` fired, no new attempt starts: the call
 * returns `{ type: 'interrupted', retryable: true }` without recording
 * anything, since nothing ran. Recorded terminal outputs still replay.
 *
 * Turns start here: before appending a new attempt's `effect-start`, a
 * delivered `prompt` submission without a `turn-start` event gets one (ID
 * `turn-start:${submissionId}`), and the `start` stream part is emitted under
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
   * Effect keys with active invocations in this drive, including initialization
   * and persistence. Prevents overlapping calls for the same key and defers
   * unsubscribe after abort until every invocation has settled.
   */
  const running = new Set<string>();

  /**
   * Latest accepted attempt for each effect key. Used to replay committed
   * outputs, determine whether another attempt is allowed, and assign its number.
   */
  const byKey = new Map<string, EffectRecord>();

  /**
   * Every accepted attempt indexed by its start event ID, sharing records with
   * byKey. Used to associate progress and end events with their attempt and to
   * confirm local starts and outputs after appending. Retaining earlier attempts
   * also lets late events be identified and ignored once an attempt is superseded.
   */
  const byStartId = new Map<string, EffectRecord>();

  /**
   * IDs of all `prompt` submissions seen so far.
   */
  const prompts = new Set<string>();

  /**
   * Submission IDs of all turns with a committed `turn-start` event.
   */
  const startedTurns = new Set<string>();

  /**
   * Submission IDs of all turns with a committed `finish-turn` event.
   */
  const finishedTurns = new Set<string>();

  /**
   * Submission ID of the turn with the latest committed `turn-start` event.
   */
  let latestTurn: string | undefined;

  /**
   * Submission ID of the turn whose `turn-start` event is being appended by
   * this effect function, until that append settled. Counts as an unfinished
   * turn, so a concurrent effect cannot start another turn meanwhile.
   */
  let startingTurn: string | undefined;

  const pendingEvents: HarnessAgentLogEvent[] = [];
  let initialized = false;
  let initialization: Promise<void> | undefined;
  let stateFailed = false;
  let stateError: unknown;
  let unsubscribed = false;

  const unsubscribe = log.onAppend({
    config: { types: effectEventTypes },
    listener(event) {
      if (stateFailed) return;
      try {
        if (initialized) applyEvent({ event });
        else pendingEvents.push(event);
      } catch (error) {
        stateFailed = true;
        stateError = error;
      }
    },
  });

  stopAbortSignal.addEventListener('abort', unsubscribeIfFinished, {
    once: true,
  });
  unsubscribeIfFinished();

  /**
   * Releases the subscription only after cancellation and all active calls have
   * settled, so interruption writes still update their accepted records.
   */
  function unsubscribeIfFinished(): void {
    if (!stopAbortSignal.aborted || running.size !== 0 || unsubscribed) return;
    unsubscribed = true;
    unsubscribe();
    stopAbortSignal.removeEventListener('abort', unsubscribeIfFinished);
  }

  /**
   * Throws the error that occurred earlier while updating the in-memory
   * records from a log event. The log keeps such an error from failing its
   * own writes, so it is rethrown here instead: incomplete records must never
   * allow running a callback or writing to the log.
   */
  function checkState(): void {
    if (stateFailed) throw stateError;
  }

  /**
   * Applies a committed event, in log order, to the state this function keeps:
   *
   * - `submission`, `turn-start` and `finish-turn` events update the turn
   *   state (`prompts`, `startedTurns`, `latestTurn` and `finishedTurns`),
   *   used to start turns.
   * - Effect events update the retained attempts. The first eligible start
   *   and first end win; late events for ended or superseded attempts are
   *   inert. Reading an unfinished attempt does not establish that its
   *   process stopped.
   *
   * Only committed events may update this state.
   */
  function applyEvent(options: {
    /**
     * Committed event to apply in log order.
     */
    event: HarnessAgentLogEvent;
  }): void {
    const { event } = options;
    switch (event.type) {
      case 'submission':
        if (event.data.type === 'prompt') prompts.add(event.id);
        break;

      case 'turn-start':
        startedTurns.add(event.data.submissionId);
        latestTurn = event.data.submissionId;
        break;

      case 'finish-turn':
        finishedTurns.add(event.data.submissionId);
        break;

      case 'effect-start': {
        const previous = byKey.get(event.data.key);
        if (
          event.data.attempt !== (previous?.start.data.attempt ?? 0) + 1 ||
          (previous != null && !canRetry(previous))
        ) {
          break;
        }
        const attempt: EffectRecord = { start: event };
        byKey.set(event.data.key, attempt);
        byStartId.set(event.id, attempt);
        break;
      }

      case 'effect-progress':
      case 'effect-end': {
        const attempt = byStartId.get(event.data.startId);
        if (
          attempt == null ||
          attempt.output != null ||
          byKey.get(attempt.start.data.key) !== attempt
        ) {
          break;
        }
        if (event.type === 'effect-progress') attempt.progress = event;
        else attempt.output = event.data.output;
        break;
      }

      default:
    }
  }

  /**
   * Reads the log once, shared by concurrent callers, and applies its events
   * to the in-memory records. Events received through the subscription
   * before the read finished are applied afterwards, skipping those the read
   * already returned, so no event is applied twice. A failed read leaves the
   * records untouched and can be retried; an error while applying an event
   * makes this effect function unusable.
   */
  function initialize(): Promise<void> {
    if (initialization) return initialization;
    initialization = (async () => {
      checkState();
      const batch = await log.read({ types: effectEventTypes });
      checkState();
      try {
        const historyIds = new Set(batch.events.map(event => event.id));
        for (const event of batch.events) applyEvent({ event });
        for (const event of pendingEvents) {
          if (!historyIds.has(event.id)) applyEvent({ event });
        }
        pendingEvents.length = 0;
        initialized = true;
      } catch (error) {
        stateFailed = true;
        stateError = error;
        throw error;
      }
    })().catch(error => {
      initialization = undefined;
      throw error;
    });
    return initialization;
  }

  /**
   * Records an outcome only for an accepted, unfinished attempt and returns its
   * canonical output. A competing end that committed first remains authoritative.
   * The drive signal is checked against observed records before submitting an end.
   * Storage and serialization failures propagate without rerunning the callback.
   */
  async function finishAttempt(options: {
    /**
     * Identity of the attempt being completed.
     */
    startId: string;
    /**
     * Locally observed callback outcome.
     */
    output: HarnessV2EffectOutput;
  }): Promise<HarnessV2EffectOutput> {
    checkState();
    const attempt = byStartId.get(options.startId);
    if (attempt == null) {
      throw new HarnessInvalidDriveStateError({
        message: 'HarnessAgent.effect: the effect start was not accepted.',
      });
    }
    if (attempt.output != null) return attempt.output;
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
    checkState();
    const output = byStartId.get(options.startId)?.output;
    if (output == null) {
      throw new HarnessInvalidDriveStateError({
        message: 'HarnessAgent.effect: the effect end was not accepted.',
      });
    }
    return output;
  }

  /**
   * Starts the turn of the `prompt` submission among the given ones that has
   * no `turn-start` event yet, if there is one. Appends are first-wins, so a
   * turn whose start another drive already committed is not started again,
   * and the `start` part is only emitted for a new append.
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
    const waiting = options.submissionIds.filter(
      submissionId =>
        prompts.has(submissionId) && !startedTurns.has(submissionId),
    );
    if (waiting.length === 0) return;
    if (waiting.length > 1) {
      throw new HarnessInvalidDriveStateError({
        message:
          'HarnessAgent.effect: an effect can start at most one turn, but it delivers more than one prompt that has not started a turn.',
      });
    }
    if (
      startingTurn != null ||
      (latestTurn != null && !finishedTurns.has(latestTurn))
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
        data: { submissionId },
      });
      checkState();
      startedTurns.add(submissionId);
      latestTurn = submissionId;
      if (appended) writer.emit({ part: { type: 'start' }, key: id });
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
      await initialize();
      checkState();
      const previous = byKey.get(key);
      if (previous?.output != null && !canRetry(previous)) {
        return cloneSerializableValue({
          value: previous.output,
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

      const start: EffectRecord['start'] = {
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
      checkState();
      const attempt = byStartId.get(start.id);
      if (attempt == null) {
        const winner = byKey.get(key);
        if (winner?.output != null && !canRetry(winner)) {
          return cloneSerializableValue({
            value: winner.output,
          }) as HarnessV2EffectOutput<T>;
        }
        throw new HarnessInvalidDriveStateError({
          message: 'HarnessAgent.effect: another effect start was accepted.',
        });
      }
      if (attempt.output != null) {
        return cloneSerializableValue({
          value: attempt.output,
        }) as HarnessV2EffectOutput<T>;
      }

      /*
       * Parts are tagged with the attempt that produced them, so readers can
       * withdraw them if the attempt is interrupted. Emits after the callback
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
          checkState,
          fn,
        });
      } finally {
        emitting = false;
      }
      await writer.flush();
      const output = await finishAttempt({
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
      unsubscribeIfFinished();
    }
  };
}
