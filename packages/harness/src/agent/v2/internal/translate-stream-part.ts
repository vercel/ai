import {
  generateId,
  safeParseJSON,
  type ToolSet,
} from '@ai-sdk/provider-utils';
import type { FinishReason, TextStreamPart } from 'ai';
import { HarnessEffectError } from '../../../errors/harness-effect-error';
import type { HarnessV2FinishReason } from '../../../v2/harness-v2-stream-part';
import type { HarnessAgentStreamPart } from './create-stream-writer';

/**
 * Translates a harness finish reason into the AI SDK's finish reason and raw
 * finish reason. `cancelled` has no AI SDK equivalent: it becomes `other` with
 * the raw finish reason `cancelled`, replacing any raw reason the harness
 * reported. Every other reason passes through unchanged.
 */
export function translateFinishReason(options: {
  /**
   * Finish reason reported by the harness.
   */
  finishReason: HarnessV2FinishReason;
}): { finishReason: FinishReason; rawFinishReason?: string } {
  const { unified, raw } = options.finishReason;
  if (unified === 'cancelled') {
    return { finishReason: 'other', rawFinishReason: 'cancelled' };
  }
  return { finishReason: unified, rawFinishReason: raw };
}

/**
 * Translates one engine stream part into zero or more AI SDK stream parts.
 *
 * - `text-*`, `reasoning-*`, `tool-input-*` and `raw` map one to one;
 *   `harnessMetadata` becomes `providerMetadata` and `delta` becomes `text`.
 *   `tool-input-start` is marked dynamic for dynamic tools so
 *   the UI uses the same tool part for streamed input and the final result.
 * - `tool-call` parses its JSON input (empty input counts as `{}`). The call is
 *   dynamic if the part says so, the tool is not in `tools`, or the input is
 *   not valid JSON, in which case it is also marked `invalid`.
 * - `tool-result`, `tool-error`, `tool-approval-request`,
 *   `tool-approval-response` and `tool-output-denied` are already AI SDK
 *   stream parts and pass through unchanged.
 * - `file-change` and `compaction` have no AI SDK equivalent and become a
 *   synthetic dynamic, provider-executed `tool-call` and `tool-result` pair
 *   under the reserved names `fileChange` and `compaction`.
 * - `error` becomes an AI SDK `error` part carrying a `HarnessEffectError`.
 * - `stream-start`, `reset-step`, `finish-step`,
 *   `start-turn`, `finish-turn`, `retract`, `yield` and `settle` return
 *   nothing: they are handled by the stream result or not supported yet.
 */
export async function translateStreamPart<TOOLS extends ToolSet>(options: {
  /**
   * Engine stream part to translate.
   */
  part: HarnessAgentStreamPart;

  /**
   * The agent's tools, used to tell typed from dynamic tool calls.
   */
  tools: TOOLS;
}): Promise<TextStreamPart<TOOLS>[]> {
  const { part, tools } = options;
  switch (part.type) {
    case 'text-start':
    case 'text-end':
    case 'reasoning-start':
    case 'reasoning-end':
      return [
        withOptionalProperties({
          part: { type: part.type, id: part.id },
          optional: { providerMetadata: part.harnessMetadata },
        }) as TextStreamPart<TOOLS>,
      ];

    case 'text-delta':
    case 'reasoning-delta':
      return [
        withOptionalProperties({
          part: { type: part.type, id: part.id, text: part.delta },
          optional: { providerMetadata: part.harnessMetadata },
        }) as TextStreamPart<TOOLS>,
      ];

    case 'tool-input-start': {
      const dynamic =
        part.dynamic === true ||
        !Object.hasOwn(tools, part.toolName) ||
        tools[part.toolName].type === 'dynamic';
      return [
        withOptionalProperties({
          part: { ...part },
          optional: { dynamic: dynamic ? true : undefined },
        }) as TextStreamPart<TOOLS>,
      ];
    }

    case 'tool-input-delta':
    case 'tool-input-end':
      return [part as TextStreamPart<TOOLS>];

    case 'tool-call': {
      const parsed = await safeParseJSON({
        text: part.input.trim() === '' ? '{}' : part.input,
      });
      const dynamic =
        part.dynamic === true ||
        !Object.hasOwn(tools, part.toolName) ||
        tools[part.toolName].type === 'dynamic' ||
        !parsed.success;
      const input = parsed.success ? parsed.value : part.input;
      return [
        withOptionalProperties({
          part: {
            type: 'tool-call',
            toolCallId: part.toolCallId,
            toolName: part.toolName,
            input,
          },
          optional: {
            dynamic: dynamic ? true : undefined,
            providerExecuted: part.providerExecuted,
            providerMetadata: part.providerMetadata,
            invalid: parsed.success ? undefined : true,
            error: parsed.success ? undefined : parsed.error,
          },
        }) as TextStreamPart<TOOLS>,
      ];
    }

    case 'tool-result':
    case 'tool-error':
    case 'tool-approval-request':
    case 'tool-approval-response':
    case 'tool-output-denied':
      return [part as TextStreamPart<TOOLS>];

    case 'file-change': {
      const payload = { event: part.event, path: part.path };
      return createSyntheticToolParts<TOOLS>({
        toolCallId: `harness-file-change-${generateId()}`,
        toolName: 'fileChange',
        input: payload,
        output: payload,
        providerMetadata: part.harnessMetadata,
      });
    }

    case 'compaction': {
      const output = withOptionalProperties({
        part: { trigger: part.trigger, summary: part.summary },
        optional: {
          tokensBefore: part.tokensBefore,
          tokensAfter: part.tokensAfter,
        },
      });
      return createSyntheticToolParts<TOOLS>({
        toolCallId: `harness-compaction-${generateId()}`,
        toolName: 'compaction',
        input: {},
        output,
        providerMetadata: part.harnessMetadata,
      });
    }

    case 'error':
      return [
        {
          type: 'error',
          error: new HarnessEffectError({ message: part.error.message }),
        },
      ];

    case 'raw':
      return [{ type: 'raw', rawValue: part.rawValue }];

    case 'stream-start':
    case 'reset-step':
    case 'finish-step':
    case 'start-turn':
    case 'prompt-message':
    case 'steering-message':
    case 'finish-turn':
    case 'retract':
    case 'yield':
    case 'settle':
      return [];
  }
}

/**
 * Returns `part` with every property of `optional` added whose value is
 * neither `null` nor `undefined`, so absent values are left out instead of
 * being set to `undefined`.
 */
function withOptionalProperties(options: {
  /**
   * Object with the required properties.
   */
  part: Record<string, unknown>;

  /**
   * Properties to add if present.
   */
  optional: Record<string, unknown>;
}): Record<string, unknown> {
  const { part, optional } = options;
  for (const [key, value] of Object.entries(optional)) {
    if (value != null) part[key] = value;
  }
  return part;
}

/**
 * Creates the synthetic dynamic, provider-executed `tool-call` and
 * `tool-result` pair that represents a harness event without an AI SDK
 * stream part equivalent.
 */
function createSyntheticToolParts<TOOLS extends ToolSet>(options: {
  /**
   * Generated ID of the synthetic call.
   */
  toolCallId: string;

  /**
   * Reserved name of the synthetic tool.
   */
  toolName: string;

  /**
   * Input of the synthetic call.
   */
  input: unknown;

  /**
   * Output of the synthetic call.
   */
  output: unknown;

  /**
   * Metadata of the harness event, if any.
   */
  providerMetadata?: unknown;
}): TextStreamPart<TOOLS>[] {
  const { toolCallId, toolName, input, output, providerMetadata } = options;
  const shared = withOptionalProperties({
    part: {
      toolCallId,
      toolName,
      input,
      dynamic: true,
      providerExecuted: true,
    },
    optional: { providerMetadata },
  });
  return [
    { type: 'tool-call', ...shared } as TextStreamPart<TOOLS>,
    { type: 'tool-result', ...shared, output } as TextStreamPart<TOOLS>,
  ];
}
