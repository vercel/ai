import type { SerializableValue } from '@ai-sdk/provider';
import {
  cloneSerializableValue,
  generateId,
  getErrorMessage,
  jsonDecodeSerializableValue,
  jsonEncodeSerializableValue,
} from '@ai-sdk/provider-utils';
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
  return {
    type: 'interrupted',
    retryable: attempt.start.data.replay === 'safe',
    ...(attempt.progress ? { partial: attempt.progress.data.partial } : {}),
  };
}

/**
 * Invokes a callback or iterates its yielded values with durable progress
 * backpressure. Cancellation is cooperative: pending callback work must settle
 * before an interruption can be recorded. Persistence is deliberately outside
 * callback error handlers so infrastructure failures cannot become effect errors.
 */
async function executeCallback(input: {
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
   * Rejects execution if committed events could not be folded into records.
   */
  checkState: () => void;
  /**
   * Work to execute once its start has committed.
   */
  fn: (
    context: HarnessV2EffectContext,
  ) => PromiseLike<SerializableValue> | AsyncIterable<SerializableValue>;
}): Promise<CallbackOutput> {
  const { log, abortSignal, attempt, emit, checkState, fn } = input;

  /**
   * Separates drive-rebuild errors and cancellation from ordinary callback
   * failures. The caller persists the output before propagating a rebuild error.
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
 * must abort the drive signal when the drive ends to release that subscription;
 * active effects retain it until their interruption persistence has settled.
 * Each executed attempt's callback emits through the stream writer, tagged with
 * its start ID; the writer is flushed before the attempt's end is committed.
 */
export function createEffectFunction(input: {
  /**
   * Authoritative log shared by the session's drive attempts.
   */
  log: HarnessAgentLog;
  /**
   * Cancellation signal for this drive, passed unchanged to callbacks.
   */
  abortSignal: AbortSignal;
  /**
   * Writer for the session's stream, used by each attempt's `emit`.
   */
  writer: HarnessAgentStreamWriter;
}): HarnessAgentEffectFunction {
  const { log, abortSignal, writer } = input;

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
  const pendingEvents: HarnessAgentLogEvent[] = [];
  let initialized = false;
  let initialization: Promise<void> | undefined;
  let stateFailed = false;
  let stateError: unknown;
  let unsubscribed = false;

  const unsubscribe = log.onAppend({
    config: { types: ['effect-start', 'effect-progress', 'effect-end'] },
    listener(event) {
      if (stateFailed) return;
      try {
        if (initialized) applyEffectEvent({ event });
        else pendingEvents.push(event);
      } catch (error) {
        stateFailed = true;
        stateError = error;
      }
    },
  });

  abortSignal.addEventListener('abort', unsubscribeIfFinished, { once: true });
  unsubscribeIfFinished();

  /**
   * Releases the subscription only after cancellation and all active calls have
   * settled, so interruption writes still update their accepted records.
   */
  function unsubscribeIfFinished(): void {
    if (!abortSignal.aborted || running.size !== 0 || unsubscribed) return;
    unsubscribed = true;
    unsubscribe();
    abortSignal.removeEventListener('abort', unsubscribeIfFinished);
  }

  /**
   * Propagates a fold failure that the log isolated from its durable writes.
   * Incomplete records must never authorize callback execution or persistence.
   */
  function checkState(): void {
    if (stateFailed) throw stateError;
  }

  /**
   * Applies newly committed events to retained attempts in log order. The first
   * eligible start and first end win; late events for ended or superseded
   * attempts are inert. Reading an unfinished attempt does not establish that
   * its process stopped. Only committed events may update retained records.
   */
  function applyEffectEvent(input: {
    /**
     * Committed event to apply in log order.
     */
    event: HarnessAgentLogEvent;
  }): void {
    const { event } = input;
    if (event.type === 'effect-start') {
      const previous = byKey.get(event.data.key);
      if (
        event.data.attempt !== (previous?.start.data.attempt ?? 0) + 1 ||
        (previous != null && !canRetry(previous))
      ) {
        return;
      }
      const attempt: EffectRecord = { start: event };
      byKey.set(event.data.key, attempt);
      byStartId.set(event.id, attempt);
    } else if (
      event.type === 'effect-progress' ||
      event.type === 'effect-end'
    ) {
      const attempt = byStartId.get(event.data.startId);
      if (
        attempt == null ||
        attempt.output != null ||
        byKey.get(attempt.start.data.key) !== attempt
      ) {
        return;
      }
      if (event.type === 'effect-progress') attempt.progress = event;
      else attempt.output = event.data.output;
    }
  }

  /**
   * Loads history once for concurrent callers, then reconciles notifications
   * buffered since registration without folding overlapping events twice.
   * Failed reads leave records untouched and notifications available for retry;
   * a fold failure instead makes this factory unusable.
   */
  function initialize(): Promise<void> {
    if (initialization) return initialization;
    initialization = (async () => {
      checkState();
      const batch = await log.read({
        types: ['effect-start', 'effect-progress', 'effect-end'],
      });
      checkState();
      try {
        const historyIds = new Set(batch.events.map(event => event.id));
        for (const event of batch.events) applyEffectEvent({ event });
        for (const event of pendingEvents) {
          if (!historyIds.has(event.id)) applyEffectEvent({ event });
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
  async function finishAttempt(input: {
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
    const attempt = byStartId.get(input.startId);
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
        startId: input.startId,
        output:
          input.output.type === 'interrupted' || abortSignal.aborted
            ? interruption(attempt)
            : input.output,
      },
    });
    checkState();
    const output = byStartId.get(input.startId)?.output;
    if (output == null) {
      throw new HarnessInvalidDriveStateError({
        message: 'HarnessAgent.effect: the effect end was not accepted.',
      });
    }
    return output;
  }

  /**
   * Replays a terminal output or executes the winning new attempt. Concurrent
   * calls for the same key cannot run another callback in this drive.
   */
  return async function effect<T extends SerializableValue = SerializableValue>(
    opts: HarnessAgentEffectOptions<T>,
  ): Promise<HarnessV2EffectOutput<T>> {
    const { key, fn, ...options } = opts;
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
      if (abortSignal.aborted) {
        return { type: 'interrupted', retryable: options.replay === 'safe' };
      }
      if (previous != null && !canRetry(previous)) {
        throw new HarnessInvalidDriveStateError({
          message:
            'HarnessAgent.effect: the unfinished attempt requires recovery.',
        });
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
          abortSignal,
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
