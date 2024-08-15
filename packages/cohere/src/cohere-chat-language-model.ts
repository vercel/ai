import {
  LanguageModelV1,
  LanguageModelV1FinishReason,
  LanguageModelV1StreamPart,
  UnsupportedFunctionalityError,
} from '@ai-sdk/provider';
import {
  ParseResult,
  combineHeaders,
  createJsonResponseHandler,
  createJsonStreamResponseHandler,
  generateId,
  postJsonToApi,
} from '@ai-sdk/provider-utils';
import { z } from 'zod';
import { CohereChatModelId, CohereChatSettings } from './cohere-chat-settings';
import { cohereFailedResponseHandler } from './cohere-error';
import { convertToCohereChatPrompt } from './convert-to-cohere-chat-prompt';
import { mapCohereFinishReason } from './map-cohere-finish-reason';

type CohereChatConfig = {
  provider: string;
  baseURL: string;
  headers: () => Record<string, string | undefined>;
  generateId: () => string;
  fetch?: typeof fetch;
};

export class CohereChatLanguageModel implements LanguageModelV1 {
  readonly specificationVersion = 'v1';
  readonly defaultObjectGenerationMode = undefined;

  readonly modelId: CohereChatModelId;
  readonly settings: CohereChatSettings;

  private readonly config: CohereChatConfig;

  constructor(
    modelId: CohereChatModelId,
    settings: CohereChatSettings,
    config: CohereChatConfig,
  ) {
    this.modelId = modelId;
    this.settings = settings;
    this.config = config;
  }

  get provider(): string {
    return this.config.provider;
  }

  private getArgs({
    mode,
    prompt,
    maxTokens,
    temperature,
    topP,
    topK,
    frequencyPenalty,
    presencePenalty,
    stopSequences,
    responseFormat,
    seed,
  }: Parameters<LanguageModelV1['doGenerate']>[0]) {
    const type = mode.type;

    const chatPrompt = convertToCohereChatPrompt(prompt);

    // Cohere distinguishes between the current message and the chat history
    const lastMessage = chatPrompt.at(-1);
    const history = chatPrompt.slice(0, -1);

    const baseArgs = {
      // model id:
      model: this.modelId,

      // model specific settings:
      // none

      // standardized settings:
      frequency_penalty: frequencyPenalty,
      presence_penalty: presencePenalty,
      max_tokens: maxTokens,
      temperature,
      p: topP,
      k: topK,
      seed,
      stop_sequences: stopSequences,

      // response format:
      response_format:
        responseFormat?.type === 'json'
          ? { type: 'json_object', schema: responseFormat.schema }
          : undefined,

      // messages:
      chat_history: history,
      ...(lastMessage?.role === 'TOOL'
        ? { tool_results: lastMessage.tool_results }
        : {}),
      message: lastMessage
        ? lastMessage.role === 'USER'
          ? lastMessage.message
          : undefined
        : undefined,
    };

    switch (type) {
      case 'regular': {
        return { ...baseArgs, ...prepareToolsAndToolChoice(mode) };
      }

      case 'object-json': {
        throw new UnsupportedFunctionalityError({
          functionality: 'object-json mode',
        });
      }

      case 'object-tool': {
        throw new UnsupportedFunctionalityError({
          functionality: 'object-tool mode',
        });
      }

      default: {
        const _exhaustiveCheck: never = type;
        throw new Error(`Unsupported type: ${_exhaustiveCheck}`);
      }
    }
  }

  async doGenerate(
    options: Parameters<LanguageModelV1['doGenerate']>[0],
  ): Promise<Awaited<ReturnType<LanguageModelV1['doGenerate']>>> {
    const args = this.getArgs(options);

    const { responseHeaders, value: response } = await postJsonToApi({
      url: `${this.config.baseURL}/chat`,
      headers: combineHeaders(this.config.headers(), options.headers),
      body: args,
      failedResponseHandler: cohereFailedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(
        cohereChatResponseSchema,
      ),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch,
    });

    const { chat_history, message, ...rawSettings } = args;

    return {
      text: response.text,
      toolCalls: response.tool_calls
        ? response.tool_calls.map(toolCall => ({
            toolCallId: generateId(),
            toolName: toolCall.name,
            args: JSON.stringify(toolCall.parameters),
            toolCallType: 'function',
          }))
        : [],
      finishReason: mapCohereFinishReason(response.finish_reason),
      usage: {
        promptTokens: response.meta.tokens.input_tokens,
        completionTokens: response.meta.tokens.output_tokens,
      },
      rawCall: {
        rawPrompt: {
          chat_history,
          message,
        },
        rawSettings,
      },
      rawResponse: { headers: responseHeaders },
      warnings: undefined,
    };
  }

  async doStream(
    options: Parameters<LanguageModelV1['doStream']>[0],
  ): Promise<Awaited<ReturnType<LanguageModelV1['doStream']>>> {
    const args = this.getArgs(options);

    const { responseHeaders, value: response } = await postJsonToApi({
      url: `${this.config.baseURL}/chat`,
      headers: combineHeaders(this.config.headers(), options.headers),
      body: {
        ...args,
        stream: true,
      },
      failedResponseHandler: cohereFailedResponseHandler,
      successfulResponseHandler: createJsonStreamResponseHandler(
        cohereChatChunkSchema,
      ),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch,
    });

    const { chat_history, message, ...rawSettings } = args;

    let finishReason: LanguageModelV1FinishReason = 'unknown';
    let usage: { promptTokens: number; completionTokens: number } = {
      promptTokens: Number.NaN,
      completionTokens: Number.NaN,
    };

    return {
      stream: response.pipeThrough(
        new TransformStream<
          ParseResult<z.infer<typeof cohereChatChunkSchema>>,
          LanguageModelV1StreamPart
        >({
          transform(chunk, controller) {
            // handle failed chunk parsing / validation:
            if (!chunk.success) {
              finishReason = 'error';
              controller.enqueue({ type: 'error', error: chunk.error });
              return;
            }

            const value = chunk.value;
            const type = value.event_type;

            switch (type) {
              case 'text-generation': {
                controller.enqueue({
                  type: 'text-delta',
                  textDelta: value.text,
                });
                return;
              }

              case 'tool-calls-generation': {
                for (const toolCall of value.tool_calls) {
                  controller.enqueue({
                    type: 'tool-call',
                    toolCallId: generateId(),
                    toolName: toolCall.name,
                    toolCallType: 'function',
                    args: JSON.stringify(toolCall.parameters),
                  });
                }
                return;
              }

              case 'stream-end': {
                finishReason = mapCohereFinishReason(value.finish_reason);
                const tokens = value.response.meta.tokens;

                usage = {
                  promptTokens: tokens.input_tokens,
                  completionTokens: tokens.output_tokens,
                };
              }

              default: {
                return;
              }
            }
          },

          flush(controller) {
            controller.enqueue({
              type: 'finish',
              finishReason,
              usage,
            });
          },
        }),
      ),
      rawCall: {
        rawPrompt: {
          chat_history,
          message,
        },
        rawSettings,
      },
      rawResponse: { headers: responseHeaders },
      warnings: [],
    };
  }
}

// limited version of the schema, focussed on what is needed for the implementation
// this approach limits breakages when the API changes and increases efficiency
const cohereChatResponseSchema = z.object({
  text: z.string(),
  tool_calls: z
    .array(
      z.object({
        name: z.string(),
        parameters: z.unknown({}),
      }),
    )
    .optional(),
  finish_reason: z.string(),
  meta: z.object({
    tokens: z.object({
      input_tokens: z.number(),
      output_tokens: z.number(),
    }),
  }),
});

// limited version of the schema, focused on what is needed for the implementation
// this approach limits breakages when the API changes and increases efficiency
const cohereChatChunkSchema = z.discriminatedUnion('event_type', [
  z.object({
    event_type: z.literal('stream-start'),
  }),
  z.object({
    event_type: z.literal('search-queries-generation'),
  }),
  z.object({
    event_type: z.literal('search-results'),
  }),
  z.object({
    event_type: z.literal('text-generation'),
    text: z.string(),
  }),
  z.object({
    event_type: z.literal('citation-generation'),
  }),
  z.object({
    event_type: z.literal('tool-calls-generation'),
    tool_calls: z.array(
      z.object({
        name: z.string(),
        parameters: z.unknown({}),
      }),
    ),
  }),
  z.object({
    event_type: z.literal('stream-end'),
    finish_reason: z.string(),
    response: z.object({
      meta: z.object({
        tokens: z.object({
          input_tokens: z.number(),
          output_tokens: z.number(),
        }),
      }),
    }),
  }),
]);

// For reference: https://docs.cohere.com/docs/parameter-types-in-tool-use

function prepareToolsAndToolChoice(
  mode: Parameters<LanguageModelV1['doGenerate']>[0]['mode'] & {
    type: 'regular';
  },
) {
  const tools = mode.tools?.length ? mode.tools : undefined;

  if (tools == null) {
    return { tools: undefined, tool_choice: undefined };
  }

  const mappedTools = tools.map(tool => {
    const { properties, required } = tool.parameters;

    const parameterDefinitions: any = {};

    if (properties) {
      for (const [key, value] of Object.entries(properties)) {
        if (typeof value === 'object' && value !== null) {
          const { type: JSONType, description } = value;

          let type;

          if (typeof JSONType === 'string') {
            switch (JSONType) {
              case 'string':
                type = 'str';
                break;

              case 'number':
                type = 'float';
                break;

              case 'integer':
                type = 'int';
                break;

              case 'boolean':
                type = 'bool';
                break;
            }
          } else if (Array.isArray(JSONType)) {
          } else {
            throw 'Unsupported type';
          }

          parameterDefinitions[key] = {
            required: required ? required.includes(key) : false,
            type,
            description,
          };
        }
      }
    }

    return {
      name: tool.name,
      description: tool.description,
      parameterDefinitions,
    };
  });

  const toolChoice = mode.toolChoice;

  if (toolChoice == null) {
    return { tools: mappedTools, tool_choice: undefined };
  }

  const type = toolChoice.type;

  switch (type) {
    case 'auto':
      return { tools: mappedTools, tool_choice: { type: 'auto' } };
    case 'required':
      return { tools: mappedTools, tool_choice: { type: 'any' } };
    case 'none':
      // Anthropic does not support 'none' tool choice, so we remove the tools:
      return { tools: undefined, tool_choice: undefined };
    case 'tool':
      return {
        tools: mappedTools,
        tool_choice: { type: 'tool', name: toolChoice.toolName },
      };
    default: {
      const _exhaustiveCheck: never = type;
      throw new Error(`Unsupported tool choice type: ${_exhaustiveCheck}`);
    }
  }
}
