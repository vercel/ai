import type {
  HarnessV2EffectOutput,
  HarnessV2ToolExecutionValue,
  HarnessV2LogEvent,
  HarnessV2TurnSettings,
} from '@ai-sdk/harness';
import type { UserModelMessage } from '@ai-sdk/provider-utils';
import type {
  AssistantMessage,
  JsonValue,
  Message,
  ToolCall,
  ToolResultMessage,
} from '@earendil-works/pi-ai';
import { toRecordedAgentToolResult } from './pi-tool-results';
import { toPiJsonValue } from './to-json-value';

/**
 * A Pi type as recorded in the log. It is structurally the same type, but
 * with Pi's interfaces turned into anonymous object types: TypeScript never
 * gives an interface an implicit index signature, so Pi's types are never
 * assignable to `SerializableValue` although their values are serializable.
 * Pi's `JsonValue` types already are, and are kept as they are.
 */
export type PiRecorded<T> = T extends JsonValue | bigint | undefined
  ? T
  : T extends (infer ITEM)[]
    ? PiRecorded<ITEM>[]
    : { [KEY in keyof T]: PiRecorded<T[KEY]> };

/**
 * Input recorded for each model effect. The transcript is an exact fold of
 * the log: each model effect records the messages appended to the transcript
 * since the previous model call (user prompts, tool results and system
 * messages), and its output is the assistant message, so the transcript is
 * the concatenation of every effect's `appended` messages and output.
 */
export type PiModelEffectInput = {
  /**
   * Messages appended to the transcript since the previous model call.
   */
  appended: Message[];

  /**
   * Number of messages in the request, checked when the effect is replayed
   * to detect a transcript that diverged from the recorded one.
   */
  contextLength: number;

  /**
   * Model of the request, as `provider/id`.
   */
  model: string;
};

/**
 * A prompt submission read from the log.
 */
export type PiPromptSubmission = {
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
 * The latest attempt of one model effect, read from the log.
 */
export type PiModelEffectRecord = {
  /**
   * Position of the effect among all model effects (`model:${ordinal}`).
   */
  ordinal: number;

  /**
   * Input of the latest attempt.
   */
  input: PiModelEffectInput;

  /**
   * Submissions delivered by the latest attempt.
   */
  deliveredSubmissionIds: readonly string[];

  /**
   * Output of the latest attempt, if it ended.
   */
  output?: HarnessV2EffectOutput<AssistantMessage>;
};

/**
 * The turn started by the latest delivered prompt.
 */
export type PiCurrentTurn = {
  /**
   * Prompt that started the turn.
   */
  prompt: PiPromptSubmission;

  /**
   * Ordinal of the model effect that delivered the prompt, i.e. the turn's
   * first step.
   */
  firstModelOrdinal: number;

  /**
   * Whether a `finish-turn` event was recorded after the turn started.
   */
  ended: boolean;
};

/**
 * Session state the adapter derives from its log.
 */
export type PiLogState = {
  /**
   * All prompt submissions, in log order.
   */
  prompts: PiPromptSubmission[];

  /**
   * Prompt submissions that no effect delivered yet, in log order.
   */
  pendingPrompts: PiPromptSubmission[];

  /**
   * The latest attempt of every model effect, ordered by ordinal.
   */
  modelEffects: PiModelEffectRecord[];

  /**
   * Output of the latest ended attempt of every tool effect, by tool call ID.
   */
  toolOutputs: Map<string, HarnessV2EffectOutput<HarnessV2ToolExecutionValue>>;

  /**
   * The turn started by the latest delivered prompt, if any prompt was
   * delivered.
   */
  currentTurn?: PiCurrentTurn;
};

const MODEL_KEY_PATTERN = /^model:(\d+)$/;
const TOOL_KEY_PREFIX = 'tool:';

/**
 * Folds the adapter-visible log events into the session state.
 *
 * A turn has ended once a `finish-turn` event is recorded after the first
 * effect start that delivered its prompt. Only log positions are compared:
 * the turn ID of a `finish-turn` event is opaque to the adapter. Steering
 * submissions are ignored.
 */
export function readPiLogState(options: {
  /**
   * Log events in log order.
   */
  events: ReadonlyArray<HarnessV2LogEvent>;
}): PiLogState {
  const prompts: PiPromptSubmission[] = [];
  const firstDelivery = new Map<
    string,
    { position: number; modelOrdinal?: number }
  >();
  const startKeys = new Map<string, string>();
  const modelEffects = new Map<number, PiModelEffectRecord>();
  const toolOutputs = new Map<
    string,
    HarnessV2EffectOutput<HarnessV2ToolExecutionValue>
  >();
  const finishTurnPositions: number[] = [];

  /*
   * The log types effect inputs and outputs as any serializable value, since
   * it holds every kind of effect. The key identifies the effect, which
   * determines what was recorded: the drive records each model effect with a
   * `PiModelEffectInput` input and the assistant message as its result, and
   * `executeHostTool()` and `executeBuiltinTool()` record each tool effect's
   * results and partials as `HarnessV2ToolExecutionValue`s.
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
        const modelOrdinal = MODEL_KEY_PATTERN.exec(key)?.[1];
        const ordinal =
          modelOrdinal == null ? undefined : Number.parseInt(modelOrdinal, 10);
        if (ordinal != null) {
          modelEffects.set(ordinal, {
            ordinal,
            input: input as PiRecorded<PiModelEffectInput>,
            deliveredSubmissionIds,
          });
        }
        for (const submissionId of deliveredSubmissionIds) {
          if (!firstDelivery.has(submissionId)) {
            firstDelivery.set(submissionId, {
              position,
              modelOrdinal: ordinal,
            });
          }
        }
        return;
      }
      case 'effect-end': {
        const key = startKeys.get(event.data.startId);
        if (key == null) return;
        const modelOrdinal = MODEL_KEY_PATTERN.exec(key)?.[1];
        if (modelOrdinal != null) {
          const record = modelEffects.get(Number.parseInt(modelOrdinal, 10));
          if (record != null) {
            record.output = event.data.output as HarnessV2EffectOutput<
              PiRecorded<AssistantMessage>
            >;
          }
        } else if (key.startsWith(TOOL_KEY_PREFIX)) {
          toolOutputs.set(
            key.slice(TOOL_KEY_PREFIX.length),
            event.data
              .output as HarnessV2EffectOutput<HarnessV2ToolExecutionValue>,
          );
        }
        return;
      }
      case 'finish-turn':
        finishTurnPositions.push(position);
    }
  });

  let currentTurn: PiCurrentTurn | undefined;
  let latestDelivery = -1;
  for (const prompt of prompts) {
    const delivery = firstDelivery.get(prompt.id);
    if (delivery == null || delivery.modelOrdinal == null) continue;
    if (delivery.position < latestDelivery) continue;
    latestDelivery = delivery.position;
    currentTurn = {
      prompt,
      firstModelOrdinal: delivery.modelOrdinal,
      ended: finishTurnPositions.some(
        finishPosition => finishPosition > delivery.position,
      ),
    };
  }

  return {
    prompts,
    pendingPrompts: prompts.filter(prompt => !firstDelivery.has(prompt.id)),
    modelEffects: [...modelEffects.values()].sort(
      (left, right) => left.ordinal - right.ordinal,
    ),
    toolOutputs,
    currentTurn,
  };
}

/**
 * Transcript rebuilt from the log, and where Pi continues from it.
 */
export type PiRestoredTranscript = {
  /**
   * Messages to start Pi's agent with.
   */
  messages: Message[];

  /**
   * Number of leading messages already recorded by model effects; the next
   * model call records the messages after them as its `appended` messages.
   */
  recorded: number;

  /**
   * Ordinal of the next model call.
   */
  nextModelOrdinal: number;

  /**
   * Whether the current turn is unfinished, so Pi must re-enter its last
   * model call (`agent.continue()`) before any new prompt.
   */
  resume: boolean;
};

/**
 * Rebuilds Pi's transcript from the recorded model effects.
 *
 * Every model effect contributes its appended messages, and every one but
 * the last also its output. When the current turn is unfinished, the last
 * model call is re-entered: its appended messages belong to it again (a
 * replay records the same messages, and a retry re-records them), so they are
 * not counted as recorded, and the next model ordinal is the last one's.
 *
 * When there is no unfinished turn, the last output is part of the
 * transcript too. If it asked for tool calls that the turn never answered
 * (e.g. a turn the agent ended after a failed drive), each call is answered
 * with its recorded outcome, or with a note that it never ran, because a
 * provider rejects a tool call without a result. Those results are the first
 * messages the next model call appends.
 */
export function restorePiTranscript(options: {
  /**
   * Session state read from the log.
   */
  state: PiLogState;

  /**
   * Whether a tool name refers to one of the harness's built-in tools in the
   * current turn.
   */
  isBuiltinTool: (toolName: string) => boolean;
}): PiRestoredTranscript {
  const { state, isBuiltinTool } = options;
  const { modelEffects, currentTurn } = state;
  const last = modelEffects.at(-1);
  const resume = last != null && currentTurn != null && !currentTurn.ended;

  const messages: Message[] = [];
  modelEffects.forEach((record, index) => {
    messages.push(...record.input.appended);
    if (index < modelEffects.length - 1 && record.output?.type === 'result') {
      messages.push(record.output.value);
    }
  });

  if (last == null) {
    return { messages, recorded: 0, nextModelOrdinal: 0, resume: false };
  }
  if (resume) {
    return {
      messages,
      recorded: messages.length - last.input.appended.length,
      nextModelOrdinal: last.ordinal,
      resume: true,
    };
  }

  const response =
    last.output?.type === 'result' ? last.output.value : undefined;
  if (response != null) messages.push(response);
  const recorded = messages.length;
  if (response != null) {
    messages.push(...answerToolCalls({ response, state, isBuiltinTool }));
  }
  return {
    messages,
    recorded,
    nextModelOrdinal: last.ordinal + 1,
    resume: false,
  };
}

/**
 * Returns a result for every tool call of a response: the call's recorded
 * outcome, or that it never ran.
 */
function answerToolCalls(options: {
  /**
   * Model response whose tool calls to answer.
   */
  response: AssistantMessage;

  /**
   * Session state read from the log.
   */
  state: PiLogState;

  /**
   * Whether a tool name refers to one of the harness's built-in tools.
   */
  isBuiltinTool: (toolName: string) => boolean;
}): ToolResultMessage[] {
  const { response, state, isBuiltinTool } = options;
  const timestamp = Date.now();
  return response.content
    .filter((part): part is ToolCall => part.type === 'toolCall')
    .map(call => {
      const output = state.toolOutputs.get(call.id);
      const result =
        output == null
          ? {
              content: [
                {
                  type: 'text' as const,
                  text: 'Not run: the turn ended before this call ran.',
                },
              ],
              details: undefined,
              isError: true,
            }
          : toRecordedAgentToolResult({
              output,
              toolName: call.name,
              builtin: isBuiltinTool(call.name),
            });
      const message: ToolResultMessage = {
        role: 'toolResult',
        toolCallId: call.id,
        toolName: call.name,
        content: result.content,
        details:
          result.details === undefined
            ? undefined
            : toPiJsonValue({ value: result.details }),
        isError: result.isError === true,
        timestamp,
      };
      return message;
    });
}
