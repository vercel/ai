import {
  InvalidResponseDataError,
  LanguageModelV1,
  LanguageModelV1CallWarning,
  LanguageModelV1FinishReason,
  LanguageModelV1LogProbs,
  LanguageModelV1ProviderMetadata,
  LanguageModelV1StreamPart,
  UnsupportedFunctionalityError,
} from '@ai-sdk/provider';
import {
  FetchFunction,
  ParseResult,
  combineHeaders,
  createEventSourceResponseHandler,
  createJsonResponseHandler,
  generateId,
  isParsableJson,
  postJsonToApi,
} from '@ai-sdk/provider-utils';
import { z } from 'zod';
import { convertToOpenAIChatMessages } from './convert-to-openai-chat-messages';
import { mapOpenAIChatLogProbsOutput } from './map-openai-chat-logprobs';
import { mapOpenAIFinishReason } from './map-openai-finish-reason';
import { OpenAIChatModelId, OpenAIChatSettings } from './openai-chat-settings';
import {
  openAIErrorDataSchema,
  openaiFailedResponseHandler,
} from './openai-error';
import { getResponseMetadata } from './get-response-metadata';

type OpenAIChatConfig = {
  provider: string;
  compatibility: 'strict' | 'compatible';
  headers: () => Record<string, string | undefined>;
  url: (options: { modelId: string; path: string }) => string;
  fetch?: FetchFunction;
};

export class OpenAIChatLanguageModel implements LanguageModelV1 {
  readonly specificationVersion = 'v1';

  readonly modelId: OpenAIChatModelId;
  readonly settings: OpenAIChatSettings;

  private readonly config: OpenAIChatConfig;

  constructor(
    modelId: OpenAIChatModelId,
    settings: OpenAIChatSettings,
    config: OpenAIChatConfig,
  ) {
    this.modelId = modelId;
    this.settings = settings;
    this.config = config;
  }

  get supportsStructuredOutputs(): boolean {
    return this.settings.structuredOutputs === true;
  }

  get defaultObjectGenerationMode() {
    return this.supportsStructuredOutputs ? 'json' : 'tool';
  }

  get provider(): string {
    return this.config.provider;
  }

  get supportsImageUrls(): boolean {
    // image urls can be sent if downloadImages is disabled (default):
    return !this.settings.downloadImages;
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
    providerMetadata,
  }: Parameters<LanguageModelV1['doGenerate']>[0]) {
    const type = mode.type;

    const warnings: LanguageModelV1CallWarning[] = [];

    if (topK != null) {
      warnings.push({
        type: 'unsupported-setting',
        setting: 'topK',
      });
    }

    if (
      responseFormat != null &&
      responseFormat.type === 'json' &&
      responseFormat.schema != null
    ) {
      warnings.push({
        type: 'unsupported-setting',
        setting: 'responseFormat',
        details: 'JSON response format schema is not supported',
      });
    }

    const useLegacyFunctionCalling = this.settings.useLegacyFunctionCalling;

    if (useLegacyFunctionCalling && this.settings.parallelToolCalls === true) {
      throw new UnsupportedFunctionalityError({
        functionality: 'useLegacyFunctionCalling with parallelToolCalls',
      });
    }

    if (useLegacyFunctionCalling && this.settings.structuredOutputs === true) {
      throw new UnsupportedFunctionalityError({
        functionality: 'structuredOutputs with useLegacyFunctionCalling',
      });
    }

    const baseArgs = {
      // model id:
      model: this.modelId,

      // model specific settings:
      logit_bias: this.settings.logitBias,
      logprobs:
        this.settings.logprobs === true ||
        typeof this.settings.logprobs === 'number'
          ? true
          : undefined,
      top_logprobs:
        typeof this.settings.logprobs === 'number'
          ? this.settings.logprobs
          : typeof this.settings.logprobs === 'boolean'
          ? this.settings.logprobs
            ? 0
            : undefined
          : undefined,
      user: this.settings.user,
      parallel_tool_calls: this.settings.parallelToolCalls,

      // standardized settings:
      max_tokens: maxTokens,
      temperature,
      top_p: topP,
      frequency_penalty: frequencyPenalty,
      presence_penalty: presencePenalty,
      stop: stopSequences,
      seed,

      // openai specific settings:
      max_completion_tokens:
        providerMetadata?.openai?.maxCompletionTokens ?? undefined,
      store: providerMetadata?.openai?.store ?? undefined,
      metadata: providerMetadata?.openai?.metadata ?? undefined,

      // response format:
      response_format:
        responseFormat?.type === 'json' ? { type: 'json_object' } : undefined,

      // messages:
      messages: convertToOpenAIChatMessages({
        prompt,
        useLegacyFunctionCalling,
      }),
    };

    // reasoning models have fixed params, remove them if they are set:
    if (isReasoningModel(this.modelId)) {
      baseArgs.temperature = undefined;
      baseArgs.top_p = undefined;
      baseArgs.frequency_penalty = undefined;
      baseArgs.presence_penalty = undefined;
    }

    switch (type) {
      case 'regular': {
        return {
          args: {
            ...baseArgs,
            ...prepareToolsAndToolChoice({
              mode,
              useLegacyFunctionCalling,
              structuredOutputs: this.settings.structuredOutputs,
            }),
          },
          warnings,
        };
      }

      case 'object-json': {
        return {
          args: {
            ...baseArgs,
            response_format:
              this.settings.structuredOutputs === true
                ? {
                    type: 'json_schema',
                    json_schema: {
                      schema: mode.schema,
                      strict: true,
                      name: mode.name ?? 'response',
                      description: mode.description,
                    },
                  }
                : { type: 'json_object' },
          },
          warnings,
        };
      }

      case 'object-tool': {
        return {
          args: useLegacyFunctionCalling
            ? {
                ...baseArgs,
                function_call: {
                  name: mode.tool.name,
                },
                functions: [
                  {
                    name: mode.tool.name,
                    description: mode.tool.description,
                    parameters: mode.tool.parameters,
                  },
                ],
              }
            : {
                ...baseArgs,
                tool_choice: {
                  type: 'function',
                  function: { name: mode.tool.name },
                },
                tools: [
                  {
                    type: 'function',
                    function: {
                      name: mode.tool.name,
                      description: mode.tool.description,
                      parameters: mode.tool.parameters,
                      strict:
                        this.settings.structuredOutputs === true
                          ? true
                          : undefined,
                    },
                  },
                ],
              },
          warnings,
        };
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
    const { args, warnings } = this.getArgs(options);

    const { responseHeaders, value: response } = await postJsonToApi({
      url: this.config.url({
        path: '/chat/completions',
        modelId: this.modelId,
      }),
      headers: combineHeaders(this.config.headers(), options.headers),
      body: args,
      failedResponseHandler: openaiFailedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(
        openAIChatResponseSchema,
      ),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch,
    });

    const { messages: rawPrompt, ...rawSettings } = args;
    const choice = response.choices[0];

    let providerMetadata: LanguageModelV1ProviderMetadata | undefined;
    if (
      response.usage?.completion_tokens_details?.reasoning_tokens != null ||
      response.usage?.prompt_tokens_details?.cached_tokens != null
    ) {
      providerMetadata = { openai: {} };
      if (response.usage?.completion_tokens_details?.reasoning_tokens != null) {
        providerMetadata.openai.reasoningTokens =
          response.usage?.completion_tokens_details?.reasoning_tokens;
      }
      if (response.usage?.prompt_tokens_details?.cached_tokens != null) {
        providerMetadata.openai.cachedPromptTokens =
          response.usage?.prompt_tokens_details?.cached_tokens;
      }
    }

    return {
      text: choice.message.content ?? undefined,
      toolCalls:
        this.settings.useLegacyFunctionCalling && choice.message.function_call
          ? [
              {
                toolCallType: 'function',
                toolCallId: generateId(),
                toolName: choice.message.function_call.name,
                args: choice.message.function_call.arguments,
              },
            ]
          : choice.message.tool_calls?.map(toolCall => ({
              toolCallType: 'function',
              toolCallId: toolCall.id ?? generateId(),
              toolName: toolCall.function.name,
              args: toolCall.function.arguments!,
            })),
      finishReason: mapOpenAIFinishReason(choice.finish_reason),
      usage: {
        promptTokens: response.usage?.prompt_tokens ?? NaN,
        completionTokens: response.usage?.completion_tokens ?? NaN,
      },
      rawCall: { rawPrompt, rawSettings },
      rawResponse: { headers: responseHeaders },
      response: getResponseMetadata(response),
      warnings,
      logprobs: mapOpenAIChatLogProbsOutput(choice.logprobs),
      providerMetadata,
    };
  }

  async doStream(
    options: Parameters<LanguageModelV1['doStream']>[0],
  ): Promise<Awaited<ReturnType<LanguageModelV1['doStream']>>> {
    // reasoning models don't support streaming, we simulate it:
    if (isReasoningModel(this.modelId)) {
      const result = await this.doGenerate(options);

      const simulatedStream = new ReadableStream<LanguageModelV1StreamPart>({
        start(controller) {
          controller.enqueue({ type: 'response-metadata', ...result.response });

          if (result.text) {
            controller.enqueue({
              type: 'text-delta',
              textDelta: result.text,
            });
          }

          if (result.toolCalls) {
            for (const toolCall of result.toolCalls) {
              controller.enqueue({
                type: 'tool-call',
                ...toolCall,
              });
            }
          }

          controller.enqueue({
            type: 'finish',
            finishReason: result.finishReason,
            usage: result.usage,
            logprobs: result.logprobs,
            providerMetadata: result.providerMetadata,
          });

          controller.close();
        },
      });

      return {
        stream: simulatedStream,
        rawCall: result.rawCall,
        rawResponse: result.rawResponse,
        warnings: result.warnings,
      };
    }

    const { args, warnings } = this.getArgs(options);

    const { responseHeaders, value: response } = await postJsonToApi({
      url: this.config.url({
        path: '/chat/completions',
        modelId: this.modelId,
      }),
      headers: combineHeaders(this.config.headers(), options.headers),
      body: {
        ...args,
        stream: true,

        // only include stream_options when in strict compatibility mode:
        stream_options:
          this.config.compatibility === 'strict'
            ? { include_usage: true }
            : undefined,
      },
      failedResponseHandler: openaiFailedResponseHandler,
      successfulResponseHandler: createEventSourceResponseHandler(
        openaiChatChunkSchema,
      ),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch,
    });

    const { messages: rawPrompt, ...rawSettings } = args;

    const toolCalls: Array<{
      id: string;
      type: 'function';
      function: {
        name: string;
        arguments: string;
      };
    }> = [];

    let finishReason: LanguageModelV1FinishReason = 'unknown';
    let usage: {
      promptTokens: number | undefined;
      completionTokens: number | undefined;
    } = {
      promptTokens: undefined,
      completionTokens: undefined,
    };
    let logprobs: LanguageModelV1LogProbs;
    let isFirstChunk = true;

    const { useLegacyFunctionCalling } = this.settings;

    let providerMetadata: LanguageModelV1ProviderMetadata | undefined;
    return {
      stream: response.pipeThrough(
        new TransformStream<
          ParseResult<z.infer<typeof openaiChatChunkSchema>>,
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

            // handle error chunks:
            if ('error' in value) {
              finishReason = 'error';
              controller.enqueue({ type: 'error', error: value.error });
              return;
            }

            if (isFirstChunk) {
              isFirstChunk = false;

              controller.enqueue({
                type: 'response-metadata',
                ...getResponseMetadata(value),
              });
            }

            if (value.usage != null) {
              usage = {
                promptTokens: value.usage.prompt_tokens ?? undefined,
                completionTokens: value.usage.completion_tokens ?? undefined,
              };
              if (value.usage.prompt_tokens_details?.cached_tokens != null) {
                providerMetadata = {
                  openai: {
                    cachedPromptTokens:
                      value.usage.prompt_tokens_details?.cached_tokens,
                  },
                };
              }
            }

            const choice = value.choices[0];

            if (choice?.finish_reason != null) {
              finishReason = mapOpenAIFinishReason(choice.finish_reason);
            }

            if (choice?.delta == null) {
              return;
            }

            const delta = choice.delta;

            if (delta.content != null) {
              controller.enqueue({
                type: 'text-delta',
                textDelta: delta.content,
              });
            }

            const mappedLogprobs = mapOpenAIChatLogProbsOutput(
              choice?.logprobs,
            );
            if (mappedLogprobs?.length) {
              if (logprobs === undefined) logprobs = [];
              logprobs.push(...mappedLogprobs);
            }

            const mappedToolCalls: typeof delta.tool_calls =
              useLegacyFunctionCalling && delta.function_call != null
                ? [
                    {
                      type: 'function',
                      id: generateId(),
                      function: delta.function_call,
                      index: 0,
                    },
                  ]
                : delta.tool_calls;

            if (mappedToolCalls != null) {
              for (const toolCallDelta of mappedToolCalls) {
                const index = toolCallDelta.index;

                // Tool call start. OpenAI returns all information except the arguments in the first chunk.
                if (toolCalls[index] == null) {
                  if (toolCallDelta.type !== 'function') {
                    throw new InvalidResponseDataError({
                      data: toolCallDelta,
                      message: `Expected 'function' type.`,
                    });
                  }

                  if (toolCallDelta.id == null) {
                    throw new InvalidResponseDataError({
                      data: toolCallDelta,
                      message: `Expected 'id' to be a string.`,
                    });
                  }

                  if (toolCallDelta.function?.name == null) {
                    throw new InvalidResponseDataError({
                      data: toolCallDelta,
                      message: `Expected 'function.name' to be a string.`,
                    });
                  }

                  toolCalls[index] = {
                    id: toolCallDelta.id,
                    type: 'function',
                    function: {
                      name: toolCallDelta.function.name,
                      arguments: toolCallDelta.function.arguments ?? '',
                    },
                  };

                  const toolCall = toolCalls[index];

                  if (
                    toolCall.function?.name != null &&
                    toolCall.function?.arguments != null
                  ) {
                    // send delta if the argument text has already started:
                    if (toolCall.function.arguments.length > 0) {
                      controller.enqueue({
                        type: 'tool-call-delta',
                        toolCallType: 'function',
                        toolCallId: toolCall.id,
                        toolName: toolCall.function.name,
                        argsTextDelta: toolCall.function.arguments,
                      });
                    }

                    // check if tool call is complete
                    // (some providers send the full tool call in one chunk):
                    if (isParsableJson(toolCall.function.arguments)) {
                      controller.enqueue({
                        type: 'tool-call',
                        toolCallType: 'function',
                        toolCallId: toolCall.id ?? generateId(),
                        toolName: toolCall.function.name,
                        args: toolCall.function.arguments,
                      });
                    }
                  }

                  continue;
                }

                // existing tool call, merge
                const toolCall = toolCalls[index];

                if (toolCallDelta.function?.arguments != null) {
                  toolCall.function!.arguments +=
                    toolCallDelta.function?.arguments ?? '';
                }

                // send delta
                controller.enqueue({
                  type: 'tool-call-delta',
                  toolCallType: 'function',
                  toolCallId: toolCall.id,
                  toolName: toolCall.function.name,
                  argsTextDelta: toolCallDelta.function.arguments ?? '',
                });

                // check if tool call is complete
                if (
                  toolCall.function?.name != null &&
                  toolCall.function?.arguments != null &&
                  isParsableJson(toolCall.function.arguments)
                ) {
                  controller.enqueue({
                    type: 'tool-call',
                    toolCallType: 'function',
                    toolCallId: toolCall.id ?? generateId(),
                    toolName: toolCall.function.name,
                    args: toolCall.function.arguments,
                  });
                }
              }
            }
          },

          flush(controller) {
            controller.enqueue({
              type: 'finish',
              finishReason,
              logprobs,
              usage: {
                promptTokens: usage.promptTokens ?? NaN,
                completionTokens: usage.completionTokens ?? NaN,
              },
              ...(providerMetadata != null ? { providerMetadata } : {}),
            });
          },
        }),
      ),
      rawCall: { rawPrompt, rawSettings },
      rawResponse: { headers: responseHeaders },
      warnings,
    };
  }
}

const openAITokenUsageSchema = z
  .object({
    prompt_tokens: z.number().nullish(),
    completion_tokens: z.number().nullish(),
    prompt_tokens_details: z
      .object({
        cached_tokens: z.number().nullish(),
      })
      .nullish(),
    completion_tokens_details: z
      .object({
        reasoning_tokens: z.number().nullish(),
      })
      .nullish(),
  })
  .nullish();

// limited version of the schema, focussed on what is needed for the implementation
// this approach limits breakages when the API changes and increases efficiency
const openAIChatResponseSchema = z.object({
  id: z.string().nullish(),
  created: z.number().nullish(),
  model: z.string().nullish(),
  choices: z.array(
    z.object({
      message: z.object({
        role: z.literal('assistant').nullish(),
        content: z.string().nullish(),
        function_call: z
          .object({
            arguments: z.string(),
            name: z.string(),
          })
          .nullish(),
        tool_calls: z
          .array(
            z.object({
              id: z.string().nullish(),
              type: z.literal('function'),
              function: z.object({
                name: z.string(),
                arguments: z.string(),
              }),
            }),
          )
          .nullish(),
      }),
      index: z.number(),
      logprobs: z
        .object({
          content: z
            .array(
              z.object({
                token: z.string(),
                logprob: z.number(),
                top_logprobs: z.array(
                  z.object({
                    token: z.string(),
                    logprob: z.number(),
                  }),
                ),
              }),
            )
            .nullable(),
        })
        .nullish(),
      finish_reason: z.string().nullish(),
    }),
  ),
  usage: openAITokenUsageSchema,
});

// limited version of the schema, focussed on what is needed for the implementation
// this approach limits breakages when the API changes and increases efficiency
const openaiChatChunkSchema = z.union([
  z.object({
    id: z.string().nullish(),
    created: z.number().nullish(),
    model: z.string().nullish(),
    choices: z.array(
      z.object({
        delta: z
          .object({
            role: z.enum(['assistant']).nullish(),
            content: z.string().nullish(),
            function_call: z
              .object({
                name: z.string().optional(),
                arguments: z.string().optional(),
              })
              .nullish(),
            tool_calls: z
              .array(
                z.object({
                  index: z.number(),
                  id: z.string().nullish(),
                  type: z.literal('function').optional(),
                  function: z.object({
                    name: z.string().nullish(),
                    arguments: z.string().nullish(),
                  }),
                }),
              )
              .nullish(),
          })
          .nullish(),
        logprobs: z
          .object({
            content: z
              .array(
                z.object({
                  token: z.string(),
                  logprob: z.number(),
                  top_logprobs: z.array(
                    z.object({
                      token: z.string(),
                      logprob: z.number(),
                    }),
                  ),
                }),
              )
              .nullable(),
          })
          .nullish(),
        finish_reason: z.string().nullable().optional(),
        index: z.number(),
      }),
    ),
    usage: openAITokenUsageSchema,
  }),
  openAIErrorDataSchema,
]);

function prepareToolsAndToolChoice({
  mode,
  useLegacyFunctionCalling = false,
  structuredOutputs = false,
}: {
  mode: Parameters<LanguageModelV1['doGenerate']>[0]['mode'] & {
    type: 'regular';
  };
  useLegacyFunctionCalling?: boolean;
  structuredOutputs?: boolean;
}) {
  // when the tools array is empty, change it to undefined to prevent errors:
  const tools = mode.tools?.length ? mode.tools : undefined;

  if (tools == null) {
    return { tools: undefined, tool_choice: undefined };
  }

  const toolChoice = mode.toolChoice;

  if (useLegacyFunctionCalling) {
    const mappedFunctions = tools.map(tool => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    }));

    if (toolChoice == null) {
      return { functions: mappedFunctions, function_call: undefined };
    }

    const type = toolChoice.type;

    switch (type) {
      case 'auto':
      case 'none':
      case undefined:
        return {
          functions: mappedFunctions,
          function_call: undefined,
        };
      case 'required':
        throw new UnsupportedFunctionalityError({
          functionality: 'useLegacyFunctionCalling and toolChoice: required',
        });
      default:
        return {
          functions: mappedFunctions,
          function_call: { name: toolChoice.toolName },
        };
    }
  }

  const mappedTools = tools.map(tool => ({
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
      strict: structuredOutputs === true ? true : undefined,
    },
  }));

  if (toolChoice == null) {
    return { tools: mappedTools, tool_choice: undefined };
  }

  const type = toolChoice.type;

  switch (type) {
    case 'auto':
    case 'none':
    case 'required':
      return { tools: mappedTools, tool_choice: type };
    case 'tool':
      return {
        tools: mappedTools,
        tool_choice: {
          type: 'function',
          function: {
            name: toolChoice.toolName,
          },
        },
      };
    default: {
      const _exhaustiveCheck: never = type;
      throw new Error(`Unsupported tool choice type: ${_exhaustiveCheck}`);
    }
  }
}

function isReasoningModel(modelId: string) {
  return modelId.startsWith('o1-');
}
