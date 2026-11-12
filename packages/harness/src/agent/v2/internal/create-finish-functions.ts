import { HarnessInvalidDriveStateError } from '../../../errors/harness-invalid-drive-state-error';
import type {
  HarnessV2FinishReason,
  HarnessV2Metadata,
  HarnessV2Usage,
} from '../../../v2/harness-v2-stream-part';
import type {
  HarnessAgentFinishStepFunction,
  HarnessAgentFinishTurnFunction,
  HarnessAgentLog,
  HarnessAgentLogEvent,
  HarnessAgentStreamPart,
  HarnessAgentStreamWriter,
} from './types';

/**
 * Log event types the finish functions read to track the turn state. They
 * ignore all other types.
 */
const turnEventTypes: HarnessAgentLogEvent['type'][] = [
  'turn-start',
  'finish-step',
  'finish-turn',
];

/**
 * Creates the drive context's `finishStep()` and `finishTurn()`, which share
 * one view of the session's turns.
 *
 * The current turn is the one of the latest `turn-start` event, whether that
 * turn is finished or not. The effect function writes that event right before
 * the `effect-start` that first delivers the turn's `prompt` submission. A
 * session has at most one turn at a time, so a finished turn stays current
 * until the next turn starts, and finish calls replayed by a later drive still
 * resolve to it.
 *
 * The turn state is loaded with one log read on first use and then kept
 * current through `onAppend`, so calls never read the log again; they only
 * append when something new is recorded. The log event is the source of
 * truth: the stream part is emitted only if the append was new, and a crash
 * between the two loses only the part, which the engine re-emits at the start
 * of the next drive under the same key. Persistence failures reject.
 *
 * Once the drive's abort signal fired, calls record and emit nothing, and the
 * subscription is released after every running call settled.
 */
export function createFinishFunctions(options: {
  /**
   * Authoritative session log.
   */
  log: HarnessAgentLog;
  /**
   * Writer for the session's stream, owned by the current drive.
   */
  writer: HarnessAgentStreamWriter;
  /**
   * Abort signal of the drive that owns these functions.
   */
  abortSignal: AbortSignal;
}): {
  /**
   * Finishes the current AI SDK step.
   */
  finishStep: HarnessAgentFinishStepFunction;
  /**
   * Finishes the current turn.
   */
  finishTurn: HarnessAgentFinishTurnFunction;
} {
  const { log, writer, abortSignal } = options;

  /**
   * Number of recorded steps per turn, keyed by the turn's submission ID.
   */
  const recordedSteps = new Map<string, number>();

  /**
   * Submission IDs of all finished turns.
   */
  const finishedTurns = new Set<string>();

  let currentTurn: string | undefined;
  const pendingEvents: HarnessAgentLogEvent[] = [];
  let initialized = false;
  let initialization: Promise<void> | undefined;
  let stateFailed = false;
  let stateError: unknown;
  let running = 0;
  let unsubscribed = false;

  const unsubscribe = log.onAppend({
    config: { types: turnEventTypes },
    listener(event) {
      if (stateFailed) return;
      try {
        if (initialized) applyTurnEvent({ event });
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
   * Releases the subscription only after cancellation and all running calls
   * have settled, so their appends still update the turn state.
   */
  function unsubscribeIfFinished(): void {
    if (!abortSignal.aborted || running !== 0 || unsubscribed) return;
    unsubscribed = true;
    unsubscribe();
    abortSignal.removeEventListener('abort', unsubscribeIfFinished);
  }

  /**
   * Throws the error that occurred earlier while updating the in-memory turn
   * state from a log event. The log keeps such an error from failing its own
   * writes, so it is rethrown here instead: an incomplete turn state must
   * never allow writing to the log.
   */
  function checkState(): void {
    if (stateFailed) throw stateError;
  }

  /**
   * Applies a committed event to the turn state, in log order.
   */
  function applyTurnEvent(options: {
    /**
     * Committed event to apply in log order.
     */
    event: HarnessAgentLogEvent;
  }): void {
    const { event } = options;
    if (event.type === 'turn-start') {
      currentTurn = event.data.turnId;
    } else if (event.type === 'finish-step') {
      const { turnId } = event.data;
      recordedSteps.set(turnId, (recordedSteps.get(turnId) ?? 0) + 1);
    } else if (event.type === 'finish-turn') {
      finishedTurns.add(event.data.turnId);
    }
  }

  /**
   * Reads the log once, shared by concurrent callers, and applies its events
   * to the in-memory turn state. Events received through the subscription
   * before the read finished are applied afterwards, skipping those the read
   * already returned, so no event is applied twice. A failed read leaves the
   * state untouched and can be retried; an error while applying an event
   * makes these functions unusable.
   */
  function initialize(): Promise<void> {
    if (initialization) return initialization;
    initialization = (async () => {
      checkState();
      const batch = await log.read({ types: turnEventTypes });
      checkState();
      try {
        const historyIds = new Set(batch.events.map(event => event.id));
        for (const event of batch.events) applyTurnEvent({ event });
        for (const event of pendingEvents) {
          if (!historyIds.has(event.id)) applyTurnEvent({ event });
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
   * Runs a call against the loaded turn state, keeping the subscription alive
   * until the call settled. Calls after abort do nothing.
   */
  async function withTurnState(
    fn: (turnId: string | undefined) => Promise<void>,
  ): Promise<void> {
    if (abortSignal.aborted) return;
    running++;
    try {
      await initialize();
      checkState();
      await fn(currentTurn);
    } finally {
      running--;
      unsubscribeIfFinished();
    }
  }

  return {
    async finishStep({ stepNumber, finishReason, usage, harnessMetadata }) {
      if (!Number.isInteger(stepNumber) || stepNumber < 0) {
        throw new HarnessInvalidDriveStateError({
          message:
            'HarnessAgent.finishStep: stepNumber must be a non-negative integer.',
        });
      }
      await withTurnState(async turnId => {
        if (turnId == null) {
          throw new HarnessInvalidDriveStateError({
            message: 'HarnessAgent.finishStep: no turn has started.',
          });
        }
        const recorded = recordedSteps.get(turnId) ?? 0;
        if (stepNumber < recorded) return;
        if (finishedTurns.has(turnId)) {
          throw new HarnessInvalidDriveStateError({
            message:
              'HarnessAgent.finishStep: the current turn already finished.',
          });
        }
        if (stepNumber > recorded) {
          throw new HarnessInvalidDriveStateError({
            message: `HarnessAgent.finishStep: expected stepNumber ${recorded}, received ${stepNumber}.`,
          });
        }

        const id = `finish-step:${turnId}:${stepNumber}`;
        const data: {
          turnId: string;
          stepNumber: number;
          finishReason: HarnessV2FinishReason;
          usage: HarnessV2Usage;
          harnessMetadata?: HarnessV2Metadata;
        } = { turnId, stepNumber, finishReason, usage };
        const part: Extract<HarnessAgentStreamPart, { type: 'finish-step' }> = {
          type: 'finish-step',
          finishReason,
          usage,
        };
        if (harnessMetadata != null) {
          data.harnessMetadata = harnessMetadata;
          part.harnessMetadata = harnessMetadata;
        }
        const appended = await log.append({ type: 'finish-step', id, data });
        checkState();
        if (appended) {
          writer.emit({ part, key: id });
        }
      });
    },

    async finishTurn({ finishReason, totalUsage, harnessMetadata }) {
      await withTurnState(async turnId => {
        if (turnId == null) {
          throw new HarnessInvalidDriveStateError({
            message: 'HarnessAgent.finishTurn: no turn has started.',
          });
        }
        if (finishedTurns.has(turnId)) return;

        const id = `finish-turn:${turnId}`;
        const data: {
          turnId: string;
          finishReason: HarnessV2FinishReason;
          totalUsage: HarnessV2Usage;
          harnessMetadata?: HarnessV2Metadata;
        } = { turnId, finishReason, totalUsage };
        const part: Extract<HarnessAgentStreamPart, { type: 'finish' }> = {
          type: 'finish',
          finishReason,
          totalUsage,
        };
        if (harnessMetadata != null) {
          data.harnessMetadata = harnessMetadata;
          part.harnessMetadata = harnessMetadata;
        }
        const appended = await log.append({ type: 'finish-turn', id, data });
        checkState();
        if (appended) {
          writer.emit({ part, key: id });
        }
      });
    },
  };
}
