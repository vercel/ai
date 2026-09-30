import type { MetadataExtractor } from '@ai-sdk/openai-compatible';
import type { JSONValue } from '@ai-sdk/provider';

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function getFirstChoice(value: Record<string, unknown>) {
  const choices = value.choices;
  return Array.isArray(choices) && isRecord(choices[0])
    ? choices[0]
    : undefined;
}

function getToolCallTypes(value: unknown): Array<'function'> | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  return value.flatMap(toolCall =>
    isRecord(toolCall) && toolCall.type === 'function' ? [toolCall.type] : [],
  );
}

function extractMetadata(value: unknown): Record<string, JSONValue> {
  if (!isRecord(value)) {
    return {};
  }

  const choice = getFirstChoice(value);
  const message =
    choice != null && isRecord(choice.message) ? choice.message : undefined;
  const toolCallTypes = getToolCallTypes(message?.tool_calls);

  return {
    ...(value.object === 'chat.completion' && {
      responseObject: value.object,
    }),
    ...(typeof choice?.index === 'number' && {
      choiceIndex: choice.index,
    }),
    ...(message?.role === 'assistant' && {
      messageRole: message.role,
    }),
    ...(toolCallTypes != null && { toolCallTypes }),
  };
}

export const moonshotAIChatMetadataExtractor: MetadataExtractor = {
  async extractMetadata({ parsedBody }) {
    return { moonshotai: extractMetadata(parsedBody) };
  },

  createStreamExtractor() {
    let responseObject: 'chat.completion.chunk' | undefined;
    let choiceIndex: number | undefined;
    let messageRole: 'assistant' | undefined;
    const toolCallTypes = new Map<number, 'function'>();

    return {
      processChunk(parsedChunk) {
        if (!isRecord(parsedChunk)) {
          return;
        }

        if (parsedChunk.object === 'chat.completion.chunk') {
          responseObject = parsedChunk.object;
        }

        const choice = getFirstChoice(parsedChunk);
        if (typeof choice?.index === 'number') {
          choiceIndex = choice.index;
        }

        const delta =
          choice != null && isRecord(choice.delta) ? choice.delta : undefined;
        if (delta?.role === 'assistant') {
          messageRole = delta.role;
        }

        if (Array.isArray(delta?.tool_calls)) {
          for (const [fallbackIndex, toolCall] of delta.tool_calls.entries()) {
            if (!isRecord(toolCall) || toolCall.type !== 'function') {
              continue;
            }

            const index =
              typeof toolCall.index === 'number'
                ? toolCall.index
                : fallbackIndex;
            toolCallTypes.set(index, toolCall.type);
          }
        }
      },

      buildMetadata() {
        return {
          moonshotai: {
            ...(responseObject != null && { responseObject }),
            ...(choiceIndex != null && { choiceIndex }),
            ...(messageRole != null && { messageRole }),
            ...(toolCallTypes.size > 0 && {
              toolCallTypes: [...toolCallTypes.entries()]
                .sort(([left], [right]) => left - right)
                .map(([, type]) => type),
            }),
          },
        };
      },
    };
  },
};
