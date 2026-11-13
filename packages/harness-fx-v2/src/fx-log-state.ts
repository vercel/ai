import type {
  HarnessV2EffectOutput,
  HarnessV2FinishReason,
  HarnessV2LogEvent,
  HarnessV2ToolExecutionValue,
  HarnessV2TurnSettings,
  HarnessV2Usage,
} from '@ai-sdk/harness';
import type { UserModelMessage } from '@ai-sdk/provider-utils';

/**
 * Input recorded for each model effect.
 */
export type FxModelEffectInput = {
  /**
   * SHA-256 digest (hex) of the exact request body libfx sent. A replayed
   * request must have the same digest, since libfx sends byte-identical
   * bodies for the same conversation.
   */
  digest: string;

  /**
   * Model of the request, from its `ai-language-model-id` header, if it has
   * one.
   */
  model?: string;
};

/**
 * Result recorded for each model effect.
 */
export type FxModelEffectValue = {
  /**
   * Exact body of the model response, which libfx is given again on replay.
   */
  body: string;

  /**
   * Reason the model response finished.
   */
  finishReason: HarnessV2FinishReason;

  /**
   * Usage of the model response.
   */
  usage: HarnessV2Usage;
};

/**
 * Result recorded for each checkpoint effect: the conversation after a turn,
 * and how the turn finished.
 */
export type FxCheckpointValue = {
  /**
   * libfx checkpoint bytes, from which the next turn's engine starts.
   */
  data: Uint8Array;

  /**
   * Finish reason of the turn.
   */
  finishReason: HarnessV2FinishReason;

  /**
   * Total usage of the turn.
   */
  totalUsage: HarnessV2Usage;
};

/**
 * Result recorded for each model catalog effect: the response libfx was
 * given for its request of AI Gateway's model catalog.
 */
export type FxCatalogEffectValue = {
  /**
   * HTTP status of the response.
   */
  status: number;

  /**
   * Exact body of the response.
   */
  body: string;
};

/**
 * A prompt submission read from the log.
 */
export type FxPromptSubmission = {
  /**
   * ID of the submission event.
   */
  id: string;

  /**
   * User message of the prompt.
   */
  message: UserModelMessage;

  /**
   * Settings of the turn the prompt starts.
   */
  settings: HarnessV2TurnSettings;
};

/**
 * A turn read from the log: one prompt, delivered by the effect
 * `turn:${index}`.
 */
export type FxTurnRecord = {
  /**
   * Zero-based index of the turn in the session.
   */
  index: number;

  /**
   * Prompt that started the turn.
   */
  prompt: FxPromptSubmission;

  /**
   * Whether a `finish-turn` event was recorded after the turn started.
   */
  ended: boolean;

  /**
   * Checkpoint recorded after the turn, if any.
   */
  checkpoint?: FxCheckpointValue;
};

/**
 * The latest attempt of one model effect, read from the log.
 */
export type FxModelEffectRecord = {
  /**
   * Index of the turn of the model call.
   */
  turnIndex: number;

  /**
   * Zero-based position of the model call within its turn.
   */
  ordinal: number;

  /**
   * Input of the latest attempt.
   */
  input: FxModelEffectInput;

  /**
   * Output of the latest attempt, if it ended.
   */
  output?: HarnessV2EffectOutput<FxModelEffectValue>;
};

/**
 * Session state the adapter derives from its log.
 */
export type FxLogState = {
  /**
   * All prompt submissions, in log order.
   */
  prompts: FxPromptSubmission[];

  /**
   * Prompt submissions that no effect delivered yet, in log order.
   */
  pendingPrompts: FxPromptSubmission[];

  /**
   * Turns, by index.
   */
  turns: FxTurnRecord[];

  /**
   * The latest attempt of every model effect, by effect key.
   */
  modelEffects: Map<string, FxModelEffectRecord>;

  /**
   * Output of the latest ended attempt of every model catalog effect, by
   * effect key.
   */
  catalogOutputs: Map<string, HarnessV2EffectOutput<FxCatalogEffectValue>>;

  /**
   * Output of the latest ended attempt of every tool effect, by tool call ID.
   */
  toolOutputs: Map<string, HarnessV2EffectOutput<HarnessV2ToolExecutionValue>>;
};

const TURN_KEY_PATTERN = /^turn:(\d+)$/;
const MODEL_KEY_PATTERN = /^model:(\d+):(\d+)$/;
const CATALOG_KEY_PATTERN = /^catalog:\d+:\d+$/;
const CHECKPOINT_KEY_PATTERN = /^checkpoint:(\d+)$/;
const TOOL_KEY_PREFIX = 'tool:';

/**
 * Returns the key of the effect `model:${turnIndex}:${ordinal}`.
 */
export function getFxModelEffectKey(options: {
  /**
   * Index of the turn.
   */
  turnIndex: number;

  /**
   * Position of the model call within the turn.
   */
  ordinal: number;
}): string {
  return `model:${options.turnIndex}:${options.ordinal}`;
}

/**
 * Returns the key of the effect `catalog:${turnIndex}:${ordinal}`.
 */
export function getFxCatalogEffectKey(options: {
  /**
   * Index of the turn.
   */
  turnIndex: number;

  /**
   * Position of the model catalog request within the turn.
   */
  ordinal: number;
}): string {
  return `catalog:${options.turnIndex}:${options.ordinal}`;
}

/**
 * Returns checkpoint bytes as a `Uint8Array`, whatever binary view the log
 * returned them in.
 */
function toUint8Array(data: unknown): Uint8Array {
  if (data instanceof Uint8Array) return data;
  if (ArrayBuffer.isView(data)) {
    return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  }
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  throw new Error('fx harness: a recorded checkpoint has no bytes.');
}

/**
 * Folds the adapter-visible log events into the session state.
 *
 * A turn exists once its `turn:${index}` effect started, and its prompt is
 * the submission that effect delivered. It has ended once a `finish-turn`
 * event is recorded after that start; only log positions are compared, since
 * the turn ID of a `finish-turn` event is opaque to the adapter. Steering
 * submissions are ignored.
 */
export function readFxLogState(options: {
  /**
   * Log events in log order.
   */
  events: ReadonlyArray<HarnessV2LogEvent>;
}): FxLogState {
  const prompts: FxPromptSubmission[] = [];
  const delivered = new Set<string>();
  const startKeys = new Map<string, string>();
  const turnStarts = new Map<
    number,
    { position: number; submissionId?: string }
  >();
  const checkpoints = new Map<number, FxCheckpointValue>();
  const modelEffects = new Map<string, FxModelEffectRecord>();
  const catalogOutputs = new Map<
    string,
    HarnessV2EffectOutput<FxCatalogEffectValue>
  >();
  const toolOutputs = new Map<
    string,
    HarnessV2EffectOutput<HarnessV2ToolExecutionValue>
  >();
  const finishTurnPositions: number[] = [];

  /*
   * The log types effect inputs and outputs as any serializable value, since
   * it holds every kind of effect. The key identifies the effect, which
   * determines what was recorded: the drive records model effects with an
   * `FxModelEffectInput` and an `FxModelEffectValue`, model catalog effects
   * with an `FxCatalogEffectValue`, checkpoint effects with an
   * `FxCheckpointValue`, and the agent records tool effects with
   * `HarnessV2ToolExecutionValue`s.
   */
  options.events.forEach((event, position) => {
    switch (event.type) {
      case 'submission':
        if (event.data.type === 'prompt') {
          prompts.push({
            id: event.id,
            message: event.data.message,
            settings: event.data.settings,
          });
        }
        return;
      case 'effect-start': {
        const { key, input, deliveredSubmissionIds } = event.data;
        startKeys.set(event.id, key);
        for (const submissionId of deliveredSubmissionIds) {
          delivered.add(submissionId);
        }
        const turn = TURN_KEY_PATTERN.exec(key);
        if (turn != null) {
          const index = Number(turn[1]);
          if (!turnStarts.has(index)) {
            turnStarts.set(index, {
              position,
              submissionId: deliveredSubmissionIds[0],
            });
          }
          return;
        }
        const model = MODEL_KEY_PATTERN.exec(key);
        if (model != null) {
          modelEffects.set(key, {
            turnIndex: Number(model[1]),
            ordinal: Number(model[2]),
            input: input as FxModelEffectInput,
          });
        }
        return;
      }
      case 'effect-end': {
        const key = startKeys.get(event.data.startId);
        if (key == null) return;
        const { output } = event.data;
        const model = modelEffects.get(key);
        if (model != null) {
          model.output = output as HarnessV2EffectOutput<FxModelEffectValue>;
          return;
        }
        if (CATALOG_KEY_PATTERN.test(key)) {
          catalogOutputs.set(
            key,
            output as HarnessV2EffectOutput<FxCatalogEffectValue>,
          );
          return;
        }
        const checkpoint = CHECKPOINT_KEY_PATTERN.exec(key);
        if (checkpoint != null) {
          if (output.type === 'result') {
            const value = output.value as FxCheckpointValue;
            checkpoints.set(Number(checkpoint[1]), {
              ...value,
              data: toUint8Array(value.data),
            });
          }
          return;
        }
        if (key.startsWith(TOOL_KEY_PREFIX)) {
          toolOutputs.set(
            key.slice(TOOL_KEY_PREFIX.length),
            output as HarnessV2EffectOutput<HarnessV2ToolExecutionValue>,
          );
        }
        return;
      }
      case 'finish-turn':
        finishTurnPositions.push(position);
    }
  });

  const promptsById = new Map(prompts.map(prompt => [prompt.id, prompt]));
  const turns: FxTurnRecord[] = [];
  for (const [index, start] of [...turnStarts].sort(
    ([left], [right]) => left - right,
  )) {
    const prompt =
      start.submissionId == null
        ? undefined
        : promptsById.get(start.submissionId);
    if (prompt == null || index !== turns.length) continue;
    const checkpoint = checkpoints.get(index);
    const turn: FxTurnRecord = {
      index,
      prompt,
      ended: finishTurnPositions.some(
        finishPosition => finishPosition > start.position,
      ),
    };
    if (checkpoint != null) turn.checkpoint = checkpoint;
    turns.push(turn);
  }

  return {
    prompts,
    pendingPrompts: prompts.filter(prompt => !delivered.has(prompt.id)),
    turns,
    modelEffects,
    catalogOutputs,
    toolOutputs,
  };
}
