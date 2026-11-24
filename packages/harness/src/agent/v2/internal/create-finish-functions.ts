import { HarnessInvalidDriveStateError } from '../../../errors/harness-invalid-drive-state-error';
import type {
  HarnessV2FinishStepFunction,
  HarnessV2FinishTurnFunction,
} from '../../../v2/harness-v2-drive-context';
import type {
  HarnessV2FinishReason,
  HarnessV2Metadata,
  HarnessV2Usage,
} from '../../../v2/harness-v2-stream-part';
import type { HarnessAgentLog } from './create-log';
import type {
  HarnessAgentStreamPart,
  HarnessAgentStreamWriter,
} from './create-stream-writer';

/**
 * Finishes the current AI SDK step. Same as `HarnessV2FinishStepFunction`,
 * redeclared so the engine does not depend on the adapter-facing type.
 *
 * The current turn is the one started by the latest `turn-start` event,
 * finished or not. A `stepNumber` below the turn's recorded step
 * count is a replay and records and emits nothing; one equal to it records the
 * step and emits `finish-step`; anything else rejects.
 */
export type HarnessAgentFinishStepFunction = HarnessV2FinishStepFunction;

/**
 * Finishes the current turn. Same as `HarnessV2FinishTurnFunction`,
 * redeclared so the engine does not depend on the adapter-facing type.
 *
 * The current turn is the one started by the latest `turn-start` event. If it
 * is already finished, the call is a replay and records and
 * emits nothing; otherwise it records the finish and emits `finish-turn`.
 */
export type HarnessAgentFinishTurnFunction = HarnessV2FinishTurnFunction;

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
 * Each call looks up the current turn in the log and only appends when
 * something new is recorded. The log event is the source of
 * truth: the stream part is emitted only if the append was new, and a crash
 * between the two loses only the part, which the engine re-emits at the start
 * of the next drive under the same key. Persistence failures reject.
 *
 * Once the drive's abort signal fired, calls record and emit nothing.
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

  return {
    async finishStep({ stepNumber, finishReason, usage, harnessMetadata }) {
      if (!Number.isInteger(stepNumber) || stepNumber < 0) {
        throw new HarnessInvalidDriveStateError({
          message:
            'HarnessAgent.finishStep: stepNumber must be a non-negative integer.',
        });
      }
      if (abortSignal.aborted) return;
      const turn = log.getCurrentTurn();
      if (turn == null) {
        throw new HarnessInvalidDriveStateError({
          message: 'HarnessAgent.finishStep: no turn has started.',
        });
      }
      const { turnId } = turn.start.data;
      const recorded = turn.steps.length;
      if (stepNumber < recorded) return;
      if (turn.finish != null) {
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
      if (appended) {
        writer.emit({ part, key: id });
      }
    },

    async finishTurn({ finishReason, totalUsage, harnessMetadata }) {
      if (abortSignal.aborted) return;
      const turn = log.getCurrentTurn();
      if (turn == null) {
        throw new HarnessInvalidDriveStateError({
          message: 'HarnessAgent.finishTurn: no turn has started.',
        });
      }
      if (turn.finish != null) return;
      const { turnId } = turn.start.data;

      const id = `finish-turn:${turnId}`;
      const data: {
        turnId: string;
        finishReason: HarnessV2FinishReason;
        totalUsage: HarnessV2Usage;
        harnessMetadata?: HarnessV2Metadata;
      } = { turnId, finishReason, totalUsage };
      const part: Extract<HarnessAgentStreamPart, { type: 'finish-turn' }> = {
        type: 'finish-turn',
        finishReason,
        totalUsage,
      };
      if (harnessMetadata != null) {
        data.harnessMetadata = harnessMetadata;
        part.harnessMetadata = harnessMetadata;
      }
      const appended = await log.append({ type: 'finish-turn', id, data });
      if (appended) {
        writer.emit({ part, key: id });
      }
    },
  };
}
