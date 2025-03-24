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
  createEventSourceResponseHandler,
  createJsonResponseHandler,
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
  fetch?: FetchFunction;
};

export class CohereChatLanguageModel implements LanguageModelV1 {
  readonly specificationVersion = 'v1';
  readonly defaultObjectGenerationMode = 'json';

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

    const baseArgs = {
      // model id:
      model: this.modelId,

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
          ? { type: 'json_object', json_schema: responseFormat.schema }
          : undefined,

      // messages:
      messages: chatPrompt,
    };

    switch (type) {
      case 'regular': {
        const { tools, toolChoice, toolWarnings } = prepareTools(mode);

        return {
          args: {
            ...baseArgs,
            tools,
            tool_choice: toolChoice,
          },
          warnings: toolWarnings,
        };
      }

      case 'object-json': {
        return {
          args: {
            ...baseArgs,
            response_format:
              mode.schema == null
                ? { type: 'json_object' }
                : { type: 'json_object', json_schema: mode.schema },
          },
          warnings: [],
        };
      }

      case 'object-tool': {
        return {
          args: {
            ...baseArgs,
            tools: [
              {
                type: 'function',
                function: {
                  name: mode.tool.name,
                  description: mode.tool.description ?? '',
                  parameters: mode.tool.parameters,
                },
              },
            ],
            tool_choice: 'REQUIRED',
          },
          warnings: [],
        };
      }

      default: {
        const _exhaustiveCheck: never = type;
        throw new UnsupportedFunctionalityError({
          functionality: `Unsupported mode: ${_exhaustiveCheck}`,
        });
      }
    }
  }

  async doGenerate(
    options: Parameters<LanguageModelV1['doGenerate']>[0],
  ): Promise<Awaited<ReturnType<LanguageModelV1['doGenerate']>>> {
    const { args, warnings } = this.getArgs(options);

    const {
      responseHeaders,
      value: response,
      rawValue: rawResponse,
    } = await postJsonToApi({
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

    const { messages, ...rawSettings } = args;

    const text = response.message.content?.[0]?.text ?? '';

    return {
      text,
      toolCalls: response.message.tool_calls
        ? response.message.tool_calls.map(toolCall => ({
            toolCallId: toolCall.id,
            toolName: toolCall.function.name,
            // Cohere sometimes returns `null` for tool call arguments for tools
            // defined as having no arguments.
            args: toolCall.function.arguments.replace(/^null$/, '{}'),
            toolCallType: 'function',
          }))
        : [],
      finishReason: mapCohereFinishReason(response.finish_reason),
      usage: {
        promptTokens: response.usage.tokens.input_tokens,
        completionTokens: response.usage.tokens.output_tokens,
      },
      rawCall: {
        rawPrompt: {
          messages,
        },
        rawSettings,
      },
      response: {
        id: response.generation_id ?? undefined,
      },
      rawResponse: {
        headers: responseHeaders,
        body: rawResponse,
      },
      warnings,
      request: { body: JSON.stringify(args) },
    };
  }

  async doStream(
    options: Parameters<LanguageModelV1['doStream']>[0],
  ): Promise<Awaited<ReturnType<LanguageModelV1['doStream']>>> {
    const { args, warnings } = this.getArgs(options);

    const { responseHeaders, value: response } = await postJsonToApi({
      url: `${this.config.baseURL}/chat`,
      headers: combineHeaders(this.config.headers(), options.headers),
      body: { ...args, stream: true },
      failedResponseHandler: cohereFailedResponseHandler,
      successfulResponseHandler: createEventSourceResponseHandler(
        cohereChatChunkSchema,
      ),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch,
    });

    const { messages, ...rawSettings } = args;

    let finishReason: LanguageModelV1FinishReason = 'unknown';
    let usage: { promptTokens: number; completionTokens: number } = {
      promptTokens: Number.NaN,
      completionTokens: Number.NaN,
    };

    let pendingToolCallDelta: {
      toolCallId: string;
      toolName: string;
      argsTextDelta: string;
    } = {
      toolCallId: '',
      toolName: '',
      argsTextDelta: '',
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
            const type = value.type;

            switch (type) {
              case 'content-delta': {
                controller.enqueue({
                  type: 'text-delta',
                  textDelta: value.delta.message.content.text,
                });
                return;
              }

              case 'tool-call-start': {
                // The start message is the only one that specifies the tool id and name.
                pendingToolCallDelta = {
                  toolCallId: value.delta.message.tool_calls.id,
                  toolName: value.delta.message.tool_calls.function.name,
                  argsTextDelta:
                    value.delta.message.tool_calls.function.arguments,
                };

                // Provide visibility into the beginning of the tool call even
                // though we likely don't have full arguments yet.
                controller.enqueue({
                  type: 'tool-call-delta',
                  toolCallId: pendingToolCallDelta.toolCallId,
                  toolName: pendingToolCallDelta.toolName,
                  toolCallType: 'function',
                  argsTextDelta: pendingToolCallDelta.argsTextDelta,
                });
                return;
              }

              case 'tool-call-delta': {
                // Accumulate the arguments for the tool call.
                pendingToolCallDelta.argsTextDelta +=
                  value.delta.message.tool_calls.function.arguments;

                // Provide visibility into the updated arguments for the tool call, even though we
                // may have more arguments still coming.
                controller.enqueue({
                  type: 'tool-call-delta',
                  toolCallId: pendingToolCallDelta.toolCallId,
                  toolName: pendingToolCallDelta.toolName,
                  toolCallType: 'function',
                  argsTextDelta:
                    value.delta.message.tool_calls.function.arguments,
                });
                return;
              }

              case 'tool-call-end': {
                // Post the full tool call now that we have all of the arguments.
                controller.enqueue({
                  type: 'tool-call',
                  toolCallId: pendingToolCallDelta.toolCallId,
                  toolName: pendingToolCallDelta.toolName,
                  toolCallType: 'function',
                  args: JSON.stringify(
                    JSON.parse(
                      pendingToolCallDelta.argsTextDelta?.trim() || '{}',
                    ),
                  ),
                });

                // Clear the pending tool call. We rely on the API always
                // following a start with an end. We do not defensively clear a
                // previous accumulation of a pending tool call in
                // non-tool-related events.
                pendingToolCallDelta = {
                  toolCallId: '',
                  toolName: '',
                  argsTextDelta: '',
                };
                return;
              }

              case 'message-start': {
                controller.enqueue({
                  type: 'response-metadata',
                  id: value.id ?? undefined,
                });

                return;
              }

              case 'message-end': {
                finishReason = mapCohereFinishReason(value.delta.finish_reason);
                const tokens = value.delta.usage.tokens;

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
          messages,
        },
        rawSettings,
      },
      rawResponse: { headers: responseHeaders },
      warnings,
      request: { body: JSON.stringify({ ...args, stream: true }) },
    };
  }
}

// limited version of the schema, focussed on what is needed for the implementation
// this approach limits breakages when the API changes and increases efficiency
const cohereChatResponseSchema = z.object({
  generation_id: z.string().nullish(),
  message: z.object({
    role: z.string(),
    content: z
      .array(
        z.object({
          type: z.string(),
          text: z.string(),
        }),
      )
      .nullish(),
    tool_plan: z.string().nullish(),
    tool_calls: z
      .array(
        z.object({
          id: z.string(),
          type: z.literal('function'),
          function: z.object({
            name: z.string(),
            arguments: z.string(),
          }),
        }),
      )
      .nullish(),
  }),
  finish_reason: z.string(),
  usage: z.object({
    billed_units: z.object({
      input_tokens: z.number(),
      output_tokens: z.number(),
    }),
    tokens: z.object({
      input_tokens: z.number(),
      output_tokens: z.number(),
    }),
  }),
});

// limited version of the schema, focused on what is needed for the implementation
// this approach limits breakages when the API changes and increases efficiency
const cohereChatChunkSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('citation-start'),
  }),
  z.object({
    type: z.literal('citation-end'),
  }),
  z.object({
    type: z.literal('content-start'),
  }),
  z.object({
    type: z.literal('content-delta'),
    delta: z.object({
      message: z.object({
        content: z.object({
          text: z.string(),
        }),
      }),
    }),
  }),
  z.object({
    type: z.literal('content-end'),
  }),
  z.object({
    type: z.literal('message-start'),
    id: z.string().nullish(),
  }),
  z.object({
    type: z.literal('message-end'),
    delta: z.object({
      finish_reason: z.string(),
      usage: z.object({
        tokens: z.object({
          input_tokens: z.number(),
          output_tokens: z.number(),
        }),
      }),
    }),
  }),
  // https://docs.cohere.com/v2/docs/streaming#tool-use-stream-events-for-tool-calling
  z.object({
    type: z.literal('tool-plan-delta'),
    delta: z.object({
      message: z.object({
        tool_plan: z.string(),
      }),
    }),
  }),
  z.object({
    type: z.literal('tool-call-start'),
    delta: z.object({
      message: z.object({
        tool_calls: z.object({
          id: z.string(),
          type: z.literal('function'),
          function: z.object({
            name: z.string(),
            arguments: z.string(),
          }),
        }),
      }),
    }),
  }),
  // A single tool call's `arguments` stream in chunks and must be accumulated
  // in a string and so the full tool object info can only be parsed once we see
  // `tool-call-end`.
  z.object({
    type: z.literal('tool-call-delta'),
    delta: z.object({
      message: z.object({
        tool_calls: z.object({
          function: z.object({
            arguments: z.string(),
          }),
        }),
      }),
    }),
  }),
  z.object({
    type: z.literal('tool-call-end'),
  }),
]);
