import {
  generateId,
  safeParseJSON,
  type ToolSet,
} from '@ai-sdk/provider-utils';
import type { TextStreamPart } from 'ai';
import { HarnessEffectError } from '../../../errors/harness-effect-error';
import type { HarnessAgentStreamPart } from './create-stream-writer';

/**
 * What a translated `tool-call` part recorded about its call, so the call's
 * results can be translated with the same input and origin.
 */
export type TranslatedToolCall = {
  /**
   * Parsed tool input, or the raw input text if it was not valid JSON.
   */
  input: unknown;

  /**
   * Whether the harness runtime executed the tool, if known.
   */
  providerExecuted?: boolean;

  /**
   * Whether the call is untyped, i.e. its tool is not part of the agent's tool
   * set or its input could not be parsed.
   */
  dynamic: boolean;
};

/**
 * Translates one engine stream part into zero or more AI SDK stream parts.
 *
 * - `start`, `text-*`, `reasoning-*`, `tool-input-*` and `raw` map one to one;
 *   `harnessMetadata` becomes `providerMetadata` and `delta` becomes `text`.
 * - `tool-call` parses its JSON input (empty input counts as `{}`). The call is
 *   dynamic if the part says so, the tool is not in `tools`, or the input is
 *   not valid JSON, in which case it is also marked `invalid`. The call is
 *   recorded in `toolCalls`.
 * - `tool-result` becomes `tool-error` when `isError` is set, otherwise
 *   `tool-result`, with input and origin taken from the recorded call.
 * - `file-change` and `compaction` have no AI SDK equivalent and become a
 *   synthetic dynamic, provider-executed `tool-call` and `tool-result` pair
 *   under the reserved names `fileChange` and `compaction`.
 * - `error` becomes an AI SDK `error` part carrying a `HarnessEffectError`.
 * - `stream-start`, `tool-approval-request`, `reset-step`, `finish-step`,
 *   `finish`, `retract` and `yield` return nothing: they are handled by the
 *   stream result or not supported yet.
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

  /**
   * Tool calls translated so far in the turn, keyed by tool call ID. Updated
   * by `tool-call` parts.
   */
  toolCalls: Map<string, TranslatedToolCall>;
}): Promise<TextStreamPart<TOOLS>[]> {
  const { part, tools, toolCalls } = options;
  switch (part.type) {
    case 'start':
      return [{ type: 'start' }];

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

    case 'tool-input-start':
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
        !parsed.success;
      const input = parsed.success ? parsed.value : part.input;
      const call: TranslatedToolCall = { input, dynamic };
      if (part.providerExecuted != null) {
        call.providerExecuted = part.providerExecuted;
      }
      toolCalls.set(part.toolCallId, call);
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

    case 'tool-result': {
      const call = toolCalls.get(part.toolCallId);
      const dynamic = part.dynamic ?? call?.dynamic;
      const optional = {
        dynamic: dynamic ? true : undefined,
        providerExecuted: call?.providerExecuted,
        providerMetadata: part.providerMetadata,
      };
      if (part.isError === true) {
        return [
          withOptionalProperties({
            part: {
              type: 'tool-error',
              toolCallId: part.toolCallId,
              toolName: part.toolName,
              input: call?.input,
              error: part.result,
            },
            optional,
          }) as TextStreamPart<TOOLS>,
        ];
      }
      return [
        withOptionalProperties({
          part: {
            type: 'tool-result',
            toolCallId: part.toolCallId,
            toolName: part.toolName,
            input: call?.input,
            output: part.result,
          },
          optional: { ...optional, preliminary: part.preliminary },
        }) as TextStreamPart<TOOLS>,
      ];
    }

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
    case 'tool-approval-request':
    case 'reset-step':
    case 'finish-step':
    case 'finish':
    case 'retract':
    case 'yield':
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
