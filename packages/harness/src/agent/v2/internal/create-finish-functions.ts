import { HarnessInvalidDriveStateError } from '../../../errors/harness-invalid-drive-state-error';
import type {
  HarnessAgentFinishStepFunction,
  HarnessAgentFinishTurnFunction,
  HarnessAgentLog,
  HarnessAgentLogEvent,
  HarnessAgentStreamWriter,
} from './types';

/**
 * Log event types folded into the turn state.
 */
const turnEventTypes: HarnessAgentLogEvent['type'][] = [
  'submission',
  'effect-start',
  'finish-step',
  'finish-turn',
];

/**
 * Creates the drive context's `finishStep()` and `finishTurn()`, which share
 * one view of the session's turns.
 *
 * The current turn is the one started by the latest delivered `prompt`
 * submission, whether that turn is finished or not. A submission counts as
 * delivered once a committed `effect-start` lists it in
 * `deliveredSubmissionIds`; its position is that of its first delivery, since
 * retried attempts repeat the IDs their previous attempt delivered. A session
 * has at most one turn at a time, so a finished turn stays current until the
 * next prompt is delivered, and finish calls replayed by a later drive still
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
export function createFinishFunctions(input: {
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
  const { log, writer, abortSignal } = input;

  /**
   * IDs of all `prompt` submissions seen so far.
   */
  const prompts = new Set<string>();

  /**
   * IDs of all submissions delivered so far.
   */
  const delivered = new Set<string>();

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
   * Propagates a fold failure that the log isolated from its durable writes.
   * An incomplete turn state must never authorize an append.
   */
  function checkState(): void {
    if (stateFailed) throw stateError;
  }

  /**
   * Applies a committed event to the turn state, in log order.
   */
  function applyTurnEvent(input: {
    /**
     * Committed event to apply in log order.
     */
    event: HarnessAgentLogEvent;
  }): void {
    const { event } = input;
    if (event.type === 'submission') {
      if (event.data.type === 'prompt') prompts.add(event.id);
    } else if (event.type === 'effect-start') {
      for (const submissionId of event.data.deliveredSubmissionIds) {
        if (delivered.has(submissionId)) continue;
        delivered.add(submissionId);
        if (prompts.has(submissionId)) currentTurn = submissionId;
      }
    } else if (event.type === 'finish-step') {
      const { submissionId } = event.data;
      recordedSteps.set(
        submissionId,
        (recordedSteps.get(submissionId) ?? 0) + 1,
      );
    } else if (event.type === 'finish-turn') {
      finishedTurns.add(event.data.submissionId);
    }
  }

  /**
   * Loads history once for concurrent callers, then reconciles notifications
   * buffered since registration without folding overlapping events twice.
   * Failed reads leave the state untouched and notifications available for
   * retry; a fold failure instead makes these functions unusable.
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
    fn: (submissionId: string | undefined) => Promise<void>,
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
      await withTurnState(async submissionId => {
        if (submissionId == null) {
          throw new HarnessInvalidDriveStateError({
            message: 'HarnessAgent.finishStep: no turn has started.',
          });
        }
        const recorded = recordedSteps.get(submissionId) ?? 0;
        if (stepNumber < recorded) return;
        if (finishedTurns.has(submissionId)) {
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

        const id = `finish-step:${submissionId}:${stepNumber}`;
        const appended = await log.append({
          type: 'finish-step',
          id,
          data: {
            submissionId,
            stepNumber,
            finishReason,
            usage,
            ...(harnessMetadata != null ? { harnessMetadata } : {}),
          },
        });
        checkState();
        if (appended) {
          writer.emit({
            part: {
              type: 'finish-step',
              finishReason,
              usage,
              ...(harnessMetadata != null ? { harnessMetadata } : {}),
            },
            key: id,
          });
        }
      });
    },

    async finishTurn({ finishReason, totalUsage, harnessMetadata }) {
      await withTurnState(async submissionId => {
        if (submissionId == null) {
          throw new HarnessInvalidDriveStateError({
            message: 'HarnessAgent.finishTurn: no turn has started.',
          });
        }
        if (finishedTurns.has(submissionId)) return;

        const id = `finish-turn:${submissionId}`;
        const appended = await log.append({
          type: 'finish-turn',
          id,
          data: {
            submissionId,
            finishReason,
            totalUsage,
            ...(harnessMetadata != null ? { harnessMetadata } : {}),
          },
        });
        checkState();
        if (appended) {
          writer.emit({
            part: {
              type: 'finish',
              finishReason,
              totalUsage,
              ...(harnessMetadata != null ? { harnessMetadata } : {}),
            },
            key: id,
          });
        }
      });
    },
  };
}
