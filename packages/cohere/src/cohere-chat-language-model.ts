import {
  LanguageModelV1,
  LanguageModelV1FinishReason,
  LanguageModelV1StreamPart,
  UnsupportedFunctionalityError,
} from '@ai-sdk/provider';
import {
  FetchFunction,
  ParseResult,
  combineHeaders,
  createJsonResponseHandler,
  createJsonStreamResponseHandler,
  postJsonToApi,
} from '@ai-sdk/provider-utils';
import { z } from 'zod';
import {
  CohereChatModelId,
  CohereChatSettings,
} from '../src/cohere-chat-settings';
import { cohereFailedResponseHandler } from '../src/cohere-error';
import { convertToCohereChatPrompt } from '../src/convert-to-cohere-chat-prompt';
import { mapCohereFinishReason } from '../src/map-cohere-finish-reason';
import { prepareTools } from './cohere-prepare-tools';

type CohereChatConfig = {
  provider: string;
  baseURL: string;
  headers: () => Record<string, string | undefined>;
  generateId: () => string;
  fetch?: FetchFunction;
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
        const { tools, force_single_step, toolWarnings } = prepareTools(mode);
        return {
          ...baseArgs,
          tools,
          force_single_step,
          warnings: toolWarnings,
        };
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
    const { warnings, ...args } = this.getArgs(options);

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
    const generateId = this.config.generateId;

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
      response: {
        id: response.generation_id ?? undefined,
      },
      rawResponse: { headers: responseHeaders },
      warnings,
      request: { body: JSON.stringify(args) },
    };
  }

  async doStream(
    options: Parameters<LanguageModelV1['doStream']>[0],
  ): Promise<Awaited<ReturnType<LanguageModelV1['doStream']>>> {
    const { warnings, ...args } = this.getArgs(options);
    const body = { ...args, stream: true };

    const { responseHeaders, value: response } = await postJsonToApi({
      url: `${this.config.baseURL}/chat`,
      headers: combineHeaders(this.config.headers(), options.headers),
      body,
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

    const generateId = this.config.generateId;
    const toolCalls: Array<{
      toolCallId: string;
      toolName: string;
    }> = [];

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

              case 'tool-calls-chunk': {
                if (value.tool_call_delta) {
                  const { index } = value.tool_call_delta;

                  if (toolCalls[index] === undefined) {
                    const toolCallId = generateId();

                    toolCalls[index] = {
                      toolCallId,
                      toolName: '',
                    };
                  }

                  if (value.tool_call_delta.name) {
                    toolCalls[index].toolName = value.tool_call_delta.name;

                    controller.enqueue({
                      type: 'tool-call-delta',
                      toolCallType: 'function',
                      toolCallId: toolCalls[index].toolCallId,
                      toolName: toolCalls[index].toolName,
                      argsTextDelta: '',
                    });
                  } else if (value.tool_call_delta.parameters) {
                    controller.enqueue({
                      type: 'tool-call-delta',
                      toolCallType: 'function',
                      toolCallId: toolCalls[index].toolCallId,
                      toolName: toolCalls[index].toolName,
                      argsTextDelta: value.tool_call_delta.parameters,
                    });
                  }
                }
                return;
              }

              case 'tool-calls-generation': {
                for (let index = 0; index < value.tool_calls.length; index++) {
                  const toolCall = value.tool_calls[index];

                  controller.enqueue({
                    type: 'tool-call',
                    toolCallId: toolCalls[index].toolCallId,
                    toolName: toolCalls[index].toolName,
                    toolCallType: 'function',
                    args: JSON.stringify(toolCall.parameters),
                  });
                }

                return;
              }

              case 'stream-start': {
                controller.enqueue({
                  type: 'response-metadata',
                  id: value.generation_id ?? undefined,
                });

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
      warnings,
      request: { body: JSON.stringify(body) },
    };
  }
}

// limited version of the schema, focussed on what is needed for the implementation
// this approach limits breakages when the API changes and increases efficiency
const cohereChatResponseSchema = z.object({
  generation_id: z.string().nullish(),
  text: z.string(),
  tool_calls: z
    .array(
      z.object({
        name: z.string(),
        parameters: z.unknown({}),
      }),
    )
    .nullish(),
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
    generation_id: z.string().nullish(),
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
    event_type: z.literal('tool-calls-chunk'),
    text: z.string().optional(),
    tool_call_delta: z
      .object({
        index: z.number(),
        name: z.string().optional(),
        parameters: z.string().optional(),
      })
      .optional(),
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
