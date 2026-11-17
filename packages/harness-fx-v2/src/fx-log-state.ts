import type {
  HarnessV2EffectOutput,
  HarnessV2FinishReason,
  HarnessV2Log,
  HarnessV2LogSubmissionEvent,
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
   * Whether the turn finished.
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

const MODEL_KEY_PATTERN = /^model:(\d+):(\d+)$/;
const CATALOG_KEY_PATTERN = /^catalog:\d+:\d+$/;
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
 * Returns the prompt of a submission, or `undefined` for other submissions.
 */
function toPromptSubmission(
  submission: HarnessV2LogSubmissionEvent,
): FxPromptSubmission | undefined {
  if (submission.data.type !== 'prompt') return undefined;
  return {
    id: submission.id,
    message: submission.data.message,
    settings: submission.data.settings,
  };
}

/**
 * Returns the prompts among submissions, in their order.
 */
function toPromptSubmissions(
  submissions: readonly HarnessV2LogSubmissionEvent[],
): FxPromptSubmission[] {
  return submissions.flatMap(submission => {
    const prompt = toPromptSubmission(submission);
    return prompt == null ? [] : [prompt];
  });
}

/**
 * Looks up the session state in the log.
 *
 * The turns are the log's turns, and a turn's index is its position among
 * them: the drive's `turn:${index}` effect delivers each turn's prompt, which
 * is what starts the turn. A turn's checkpoint is the result of its
 * `checkpoint:${index}` effect. Steering submissions are ignored.
 */
export function readFxLogState(options: {
  /**
   * Log of the session.
   */
  log: HarnessV2Log;
}): FxLogState {
  const { log } = options;

  /*
   * The log types effect inputs and outputs as any serializable value, since
   * it holds every kind of effect. The key identifies the effect, which
   * determines what was recorded: the drive records model effects with an
   * `FxModelEffectInput` and an `FxModelEffectValue`, model catalog effects
   * with an `FxCatalogEffectValue`, checkpoint effects with an
   * `FxCheckpointValue`, and the agent records tool effects with
   * `HarnessV2ToolExecutionValue`s.
   */
  const turns: FxTurnRecord[] = [];
  for (const [index, logTurn] of log.getTurns().entries()) {
    const submission = logTurn.submissions[0];
    const prompt =
      submission == null ? undefined : toPromptSubmission(submission);
    if (prompt == null) break;
    const turn: FxTurnRecord = {
      index,
      prompt,
      ended: logTurn.finish != null,
    };
    const output = log.getEffect({ key: `checkpoint:${index}` })?.end?.data
      .output;
    if (output?.type === 'result') {
      const value = output.value as FxCheckpointValue;
      turn.checkpoint = { ...value, data: toUint8Array(value.data) };
    }
    turns.push(turn);
  }

  const modelEffects = new Map<string, FxModelEffectRecord>();
  for (const { start, end } of log.getEffects({ keyPrefix: 'model:' })) {
    const model = MODEL_KEY_PATTERN.exec(start.data.key);
    if (model == null) continue;
    const record: FxModelEffectRecord = {
      turnIndex: Number(model[1]),
      ordinal: Number(model[2]),
      input: start.data.input as FxModelEffectInput,
    };
    if (end != null) {
      record.output = end.data
        .output as HarnessV2EffectOutput<FxModelEffectValue>;
    }
    modelEffects.set(start.data.key, record);
  }

  const catalogOutputs = new Map<
    string,
    HarnessV2EffectOutput<FxCatalogEffectValue>
  >();
  for (const { start, end } of log.getEffects({ keyPrefix: 'catalog:' })) {
    if (end == null || !CATALOG_KEY_PATTERN.test(start.data.key)) continue;
    catalogOutputs.set(
      start.data.key,
      end.data.output as HarnessV2EffectOutput<FxCatalogEffectValue>,
    );
  }

  const toolOutputs = new Map<
    string,
    HarnessV2EffectOutput<HarnessV2ToolExecutionValue>
  >();
  for (const { start, end } of log.getEffects({ keyPrefix: TOOL_KEY_PREFIX })) {
    if (end == null) continue;
    toolOutputs.set(
      start.data.key.slice(TOOL_KEY_PREFIX.length),
      end.data.output as HarnessV2EffectOutput<HarnessV2ToolExecutionValue>,
    );
  }

  return {
    prompts: toPromptSubmissions(log.getSubmissions()),
    pendingPrompts: toPromptSubmissions(log.getUndeliveredSubmissions()),
    turns,
    modelEffects,
    catalogOutputs,
    toolOutputs,
  };
}
