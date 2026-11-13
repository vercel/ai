import type { HarnessV2StreamPart } from '@ai-sdk/harness';
import { generateId as defaultGenerateId } from '@ai-sdk/provider-utils';
import type { AssistantMessageEvent } from '@earendil-works/pi-ai';

/**
 * Translates the events of one Pi model response into harness stream parts.
 */
export type PiStreamPartTranslator = {
  /**
   * Returns the stream parts for one event, in emit order. Events without a
   * harness counterpart (e.g. `start`, `done` and `error`) return no parts.
   */
  translate(event: AssistantMessageEvent): HarnessV2StreamPart[];
};

/**
 * Creates a translator for one model response attempt.
 *
 * Text and thinking blocks get generated part IDs, keyed by Pi's content
 * index. Tool input parts use the tool call ID as their ID. A tool call whose
 * ID or name is not known yet at `toolcall_start` gets its `tool-input-start`
 * once a later event carries them, and at the latest at `toolcall_end`, so
 * every `tool-call` part is preceded by a complete tool input stream. Tool
 * parts of built-in tools are marked `providerExecuted`, because the harness
 * runs them rather than the host.
 */
export function createPiStreamPartTranslator(options: {
  /**
   * Whether a tool name refers to one of the harness's built-in tools.
   */
  isBuiltinTool: (toolName: string) => boolean;

  /**
   * Generates text and reasoning part IDs.
   */
  generateId?: () => string;
}): PiStreamPartTranslator {
  const { isBuiltinTool, generateId = defaultGenerateId } = options;
  const blockIds = new Map<number, string>();
  const toolCalls = new Map<number, { id: string; toolName: string }>();

  /**
   * Returns the parts that open the tool input stream of the tool call at the
   * content index, if it is not open yet and its ID and name are known.
   */
  function startToolInput(start: {
    /**
     * Content index of the tool call block.
     */
    contentIndex: number;

    /**
     * Tool call ID, if known.
     */
    id?: string;

    /**
     * Tool name, if known.
     */
    toolName?: string;
  }): HarnessV2StreamPart[] {
    if (toolCalls.has(start.contentIndex)) return [];
    if (!start.id || !start.toolName) return [];
    toolCalls.set(start.contentIndex, {
      id: start.id,
      toolName: start.toolName,
    });
    const part: HarnessV2StreamPart & { type: 'tool-input-start' } = {
      type: 'tool-input-start',
      id: start.id,
      toolName: start.toolName,
    };
    if (isBuiltinTool(start.toolName)) part.providerExecuted = true;
    return [part];
  }

  /**
   * Reads the ID and name of the tool call block at the content index of a
   * streamed response.
   */
  function readToolCallBlock(event: {
    /**
     * Content index of the block.
     */
    contentIndex: number;

    /**
     * Response streamed so far.
     */
    partial: { content: ReadonlyArray<unknown> };
  }): { id?: string; toolName?: string } {
    const block = event.partial.content[event.contentIndex] as
      | { type?: unknown; id?: unknown; name?: unknown }
      | undefined;
    if (block?.type !== 'toolCall') {
      return { id: undefined, toolName: undefined };
    }
    return {
      id: typeof block.id === 'string' ? block.id : undefined,
      toolName: typeof block.name === 'string' ? block.name : undefined,
    };
  }

  return {
    translate(event) {
      switch (event.type) {
        case 'text_start':
        case 'thinking_start': {
          const id = generateId();
          blockIds.set(event.contentIndex, id);
          return [
            {
              type:
                event.type === 'text_start' ? 'text-start' : 'reasoning-start',
              id,
            },
          ];
        }
        case 'text_delta':
        case 'thinking_delta': {
          const id = blockIds.get(event.contentIndex);
          if (id == null) return [];
          return [
            {
              type:
                event.type === 'text_delta' ? 'text-delta' : 'reasoning-delta',
              id,
              delta: event.delta,
            },
          ];
        }
        case 'text_end':
        case 'thinking_end': {
          const id = blockIds.get(event.contentIndex);
          if (id == null) return [];
          blockIds.delete(event.contentIndex);
          return [
            {
              type: event.type === 'text_end' ? 'text-end' : 'reasoning-end',
              id,
            },
          ];
        }
        case 'toolcall_start':
          return startToolInput({
            contentIndex: event.contentIndex,
            ...readToolCallBlock(event),
          });
        case 'toolcall_delta': {
          const parts = startToolInput({
            contentIndex: event.contentIndex,
            ...readToolCallBlock(event),
          });
          const toolCall = toolCalls.get(event.contentIndex);
          if (toolCall == null) return parts;
          return [
            ...parts,
            { type: 'tool-input-delta', id: toolCall.id, delta: event.delta },
          ];
        }
        case 'toolcall_end': {
          const { toolCall } = event;
          const parts = startToolInput({
            contentIndex: event.contentIndex,
            id: toolCall.id,
            toolName: toolCall.name,
          });
          const started = toolCalls.get(event.contentIndex);
          if (started == null) return parts;
          toolCalls.delete(event.contentIndex);
          const toolCallPart: HarnessV2StreamPart & { type: 'tool-call' } = {
            type: 'tool-call',
            toolCallId: toolCall.id,
            toolName: toolCall.name,
            input: JSON.stringify(toolCall.arguments),
          };
          if (isBuiltinTool(toolCall.name)) {
            toolCallPart.providerExecuted = true;
          }
          return [
            ...parts,
            { type: 'tool-input-end', id: started.id },
            toolCallPart,
          ];
        }
        default:
          return [];
      }
    },
  };
}
