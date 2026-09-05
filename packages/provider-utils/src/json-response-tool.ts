import {
  InvalidResponseDataError,
  type LanguageModelV3CallOptions,
  type LanguageModelV3FunctionTool,
  type LanguageModelV3StreamPart,
  type LanguageModelV3Text,
} from '@ai-sdk/provider';
import { safeParseJSON } from './parse-json';

export const jsonResponseToolMetadata = {
  'ai-sdk': { jsonResponseTool: true },
} as const;

type JsonResponseFormat = Extract<
  NonNullable<LanguageModelV3CallOptions['responseFormat']>,
  { type: 'json' }
>;

export type JsonResponseTool = {
  name: string;
  isWrapped: boolean;
};

export function prepareJsonResponseTool({
  responseFormat,
  tools,
  toolChoice,
  toolChoiceSatisfied,
}: Pick<
  LanguageModelV3CallOptions,
  'responseFormat' | 'tools' | 'toolChoice' | 'toolChoiceSatisfied'
>): {
  tools: LanguageModelV3CallOptions['tools'];
  toolChoice: LanguageModelV3CallOptions['toolChoice'];
  jsonResponseTool: JsonResponseTool | undefined;
  useJsonResponseToolFallback: boolean;
} {
  const toolsForRequest = toolChoice?.type === 'none' ? undefined : tools;
  const functionTools = toolsForRequest?.filter(
    (tool): tool is LanguageModelV3FunctionTool => tool.type === 'function',
  );
  const useJsonResponseToolFallback =
    responseFormat?.type === 'json' &&
    responseFormat.schema != null &&
    functionTools != null &&
    functionTools.length > 0;

  if (!useJsonResponseToolFallback) {
    return {
      tools: toolsForRequest,
      toolChoice: toolChoice?.type === 'none' ? undefined : toolChoice,
      jsonResponseTool: undefined,
      useJsonResponseToolFallback: false,
    };
  }

  const enforcedToolChoiceSatisfied =
    toolChoice?.type === 'required' || toolChoice?.type === 'tool'
      ? toolChoiceSatisfied === true
      : true;

  if (!enforcedToolChoiceSatisfied) {
    return {
      tools: toolsForRequest,
      toolChoice,
      jsonResponseTool: undefined,
      useJsonResponseToolFallback: true,
    };
  }

  if (toolChoice?.type === 'required' || toolChoice?.type === 'tool') {
    return {
      tools: undefined,
      toolChoice: undefined,
      jsonResponseTool: undefined,
      useJsonResponseToolFallback: false,
    };
  }

  const schema = responseFormat.schema!;
  const name = getJsonResponseToolName(functionTools);
  const isWrapped = schema.type !== 'object';
  const responseTool: LanguageModelV3FunctionTool = {
    type: 'function',
    name,
    description: isWrapped
      ? 'Respond with JSON in the value property.'
      : 'Respond with a JSON object.',
    inputSchema: isWrapped ? wrapJsonResponseSchema(schema) : schema,
  };

  return {
    tools: [...toolsForRequest!, responseTool],
    toolChoice: { type: 'required' },
    jsonResponseTool: { name, isWrapped },
    useJsonResponseToolFallback: true,
  };
}

export async function getJsonResponseToolOutput({
  input,
  isWrapped,
}: {
  input: string | unknown;
  isWrapped: boolean;
}): Promise<string> {
  if (!isWrapped && typeof input === 'string') {
    return input;
  }

  let value = input;

  if (typeof input === 'string') {
    const parseResult = await safeParseJSON({ text: input });

    if (!parseResult.success) {
      throw new InvalidResponseDataError({
        data: input,
        message: 'Invalid JSON response tool input.',
      });
    }

    value = parseResult.value;
  }

  if (isWrapped) {
    if (
      value == null ||
      typeof value !== 'object' ||
      !Object.prototype.hasOwnProperty.call(value, 'value')
    ) {
      throw new InvalidResponseDataError({
        data: value,
        message: "JSON response tool input is missing the 'value' property.",
      });
    }

    value = (value as { value: unknown }).value;
  }

  const output = JSON.stringify(value);

  if (output == null) {
    throw new InvalidResponseDataError({
      data: value,
      message: 'JSON response tool input cannot be serialized.',
    });
  }

  return output;
}

export function isJsonResponseToolText(
  part: Pick<LanguageModelV3Text, 'providerMetadata'>,
): boolean {
  return part.providerMetadata?.['ai-sdk']?.jsonResponseTool === true;
}

export function convertJsonResponseToolStream({
  stream,
  jsonResponseTool,
}: {
  stream: ReadableStream<LanguageModelV3StreamPart>;
  jsonResponseTool: JsonResponseTool;
}): ReadableStream<LanguageModelV3StreamPart> {
  const jsonToolCallIds = new Set<string>();
  const completedJsonToolCallIds = new Set<string>();
  const wrappedInputs = new Map<string, string>();
  let hasJsonResponse = false;

  return stream.pipeThrough(
    new TransformStream<LanguageModelV3StreamPart, LanguageModelV3StreamPart>({
      async transform(part, controller) {
        switch (part.type) {
          case 'text-start':
          case 'text-delta':
          case 'text-end':
            return;
          case 'tool-input-start':
            if (part.toolName === jsonResponseTool.name) {
              jsonToolCallIds.add(part.id);
              hasJsonResponse = true;
              controller.enqueue({
                type: 'text-start',
                id: part.id,
                providerMetadata: jsonResponseToolMetadata,
              });
              return;
            }
            break;
          case 'tool-input-delta':
            if (jsonToolCallIds.has(part.id)) {
              if (jsonResponseTool.isWrapped) {
                wrappedInputs.set(
                  part.id,
                  (wrappedInputs.get(part.id) ?? '') + part.delta,
                );
              } else {
                controller.enqueue({
                  type: 'text-delta',
                  id: part.id,
                  delta: part.delta,
                  providerMetadata: jsonResponseToolMetadata,
                });
              }
              return;
            }
            break;
          case 'tool-input-end':
            if (jsonToolCallIds.has(part.id)) {
              if (jsonResponseTool.isWrapped) {
                controller.enqueue({
                  type: 'text-delta',
                  id: part.id,
                  delta: await getJsonResponseToolOutput({
                    input: wrappedInputs.get(part.id) ?? '',
                    isWrapped: true,
                  }),
                  providerMetadata: jsonResponseToolMetadata,
                });
              }
              controller.enqueue({
                type: 'text-end',
                id: part.id,
                providerMetadata: jsonResponseToolMetadata,
              });
              completedJsonToolCallIds.add(part.id);
              return;
            }
            break;
          case 'tool-call':
            if (part.toolName === jsonResponseTool.name) {
              if (!completedJsonToolCallIds.has(part.toolCallId)) {
                hasJsonResponse = true;
                controller.enqueue({
                  type: 'text-start',
                  id: part.toolCallId,
                  providerMetadata: jsonResponseToolMetadata,
                });
                controller.enqueue({
                  type: 'text-delta',
                  id: part.toolCallId,
                  delta: await getJsonResponseToolOutput({
                    input: part.input,
                    isWrapped: jsonResponseTool.isWrapped,
                  }),
                  providerMetadata: jsonResponseToolMetadata,
                });
                controller.enqueue({
                  type: 'text-end',
                  id: part.toolCallId,
                  providerMetadata: jsonResponseToolMetadata,
                });
              }
              return;
            }
            break;
          case 'finish':
            if (hasJsonResponse) {
              controller.enqueue({
                ...part,
                finishReason: {
                  unified: 'stop',
                  raw: part.finishReason.raw,
                },
              });
              return;
            }
            break;
        }

        controller.enqueue(part);
      },
    }),
  );
}

function getJsonResponseToolName(tools: LanguageModelV3FunctionTool[]): string {
  const toolNames = new Set(tools.map(tool => tool.name));
  let name = 'json';
  let suffix = 1;

  while (toolNames.has(name)) {
    name = `json_${suffix++}`;
  }

  return name;
}

function wrapJsonResponseSchema(
  schema: NonNullable<JsonResponseFormat['schema']>,
) {
  return {
    type: 'object' as const,
    properties: {
      value: schema,
    },
    required: ['value'],
    additionalProperties: false,
  };
}
