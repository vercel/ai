import {
  APICallError,
  LanguageModelV1,
  LanguageModelV1CallWarning,
  LanguageModelV1FinishReason,
  LanguageModelV1StreamPart,
} from '@ai-sdk/provider';
import {
  combineHeaders,
  createEventSourceResponseHandler,
  createJsonResponseHandler,
  generateId,
  parseProviderOptions,
  ParseResult,
  postJsonToApi,
} from '@ai-sdk/provider-utils';
import { z } from 'zod';
import { OpenAIConfig } from '../openai-config';
import { openaiFailedResponseHandler } from '../openai-error';
import { convertToOpenAIResponsesMessages } from './convert-to-openai-responses-messages';
import { mapOpenAIResponseFinishReason } from './map-openai-responses-finish-reason';
import { prepareResponsesTools } from './openai-responses-prepare-tools';
import { OpenAIResponsesModelId } from './openai-responses-settings';

export class OpenAIResponsesLanguageModel implements LanguageModelV1 {
  readonly specificationVersion = 'v1';
  readonly defaultObjectGenerationMode = 'json';
  readonly supportsStructuredOutputs = true;

  readonly modelId: OpenAIResponsesModelId;

  private readonly config: OpenAIConfig;

  constructor(modelId: OpenAIResponsesModelId, config: OpenAIConfig) {
    this.modelId = modelId;
    this.config = config;
  }

  get provider(): string {
    return this.config.provider;
  }

  private getArgs({
    mode,
    maxTokens,
    temperature,
    stopSequences,
    topP,
    topK,
    presencePenalty,
    frequencyPenalty,
    seed,
    prompt,
    providerMetadata,
    responseFormat,
  }: Parameters<LanguageModelV1['doGenerate']>[0]) {
    const warnings: LanguageModelV1CallWarning[] = [];
    const modelConfig = getResponsesModelConfig(this.modelId);
    const type = mode.type;

    if (topK != null) {
      warnings.push({
        type: 'unsupported-setting',
        setting: 'topK',
      });
    }

    if (seed != null) {
      warnings.push({
        type: 'unsupported-setting',
        setting: 'seed',
      });
    }

    if (presencePenalty != null) {
      warnings.push({
        type: 'unsupported-setting',
        setting: 'presencePenalty',
      });
    }

    if (frequencyPenalty != null) {
      warnings.push({
        type: 'unsupported-setting',
        setting: 'frequencyPenalty',
      });
    }

    if (stopSequences != null) {
      warnings.push({
        type: 'unsupported-setting',
        setting: 'stopSequences',
      });
    }

    const { messages, warnings: messageWarnings } =
      convertToOpenAIResponsesMessages({
        prompt,
        systemMessageMode: modelConfig.systemMessageMode,
      });

    warnings.push(...messageWarnings);

    const openaiOptions = parseProviderOptions({
      provider: 'openai',
      providerOptions: providerMetadata,
      schema: openaiResponsesProviderOptionsSchema,
    });

    const isStrict = openaiOptions?.strictSchemas ?? true;

    const baseArgs = {
      model: this.modelId,
      input: messages,
      temperature,
      top_p: topP,
      max_output_tokens: maxTokens,

      ...(responseFormat?.type === 'json' && {
        text: {
          format:
            responseFormat.schema != null
              ? {
                  type: 'json_schema',
                  strict: isStrict,
                  name: responseFormat.name ?? 'response',
                  description: responseFormat.description,
                  schema: responseFormat.schema,
                }
              : { type: 'json_object' },
        },
      }),

      // provider options:
      metadata: openaiOptions?.metadata,
      parallel_tool_calls: openaiOptions?.parallelToolCalls,
      previous_response_id: openaiOptions?.previousResponseId,
      store: openaiOptions?.store,
      user: openaiOptions?.user,
      instructions: openaiOptions?.instructions,

      // model-specific settings:
      ...(modelConfig.isReasoningModel &&
        (openaiOptions?.reasoningEffort != null ||
          openaiOptions?.reasoningSummary != null) && {
          reasoning: {
            ...(openaiOptions?.reasoningEffort != null && {
              effort: openaiOptions.reasoningEffort,
            }),
            ...(openaiOptions?.reasoningSummary != null && {
              summary: openaiOptions.reasoningSummary,
            }),
          },
        }),
      ...(modelConfig.requiredAutoTruncation && {
        truncation: 'auto',
      }),
    };

    if (modelConfig.isReasoningModel) {
      // remove unsupported settings for reasoning models
      // see https://platform.openai.com/docs/guides/reasoning#limitations
      if (baseArgs.temperature != null) {
        baseArgs.temperature = undefined;
        warnings.push({
          type: 'unsupported-setting',
          setting: 'temperature',
          details: 'temperature is not supported for reasoning models',
        });
      }

      if (baseArgs.top_p != null) {
        baseArgs.top_p = undefined;
        warnings.push({
          type: 'unsupported-setting',
          setting: 'topP',
          details: 'topP is not supported for reasoning models',
        });
      }
    }

    switch (type) {
      case 'regular': {
        const { tools, tool_choice, toolWarnings } = prepareResponsesTools({
          mode,
          strict: isStrict, // TODO support provider options on tools
        });

        return {
          args: {
            ...baseArgs,
            tools,
            tool_choice,
          },
          warnings: [...warnings, ...toolWarnings],
        };
      }

      case 'object-json': {
        return {
          args: {
            ...baseArgs,
            text: {
              format:
                mode.schema != null
                  ? {
                      type: 'json_schema',
                      strict: isStrict,
                      name: mode.name ?? 'response',
                      description: mode.description,
                      schema: mode.schema,
                    }
                  : { type: 'json_object' },
            },
          },
          warnings,
        };
      }

      case 'object-tool': {
        return {
          args: {
            ...baseArgs,
            tool_choice: { type: 'function', name: mode.tool.name },
            tools: [
              {
                type: 'function',
                name: mode.tool.name,
                description: mode.tool.description,
                parameters: mode.tool.parameters,
                strict: isStrict,
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
    const { args: body, warnings } = this.getArgs(options);
    const url = this.config.url({
      path: '/responses',
      modelId: this.modelId,
    });

    const {
      responseHeaders,
      value: response,
      rawValue: rawResponse,
    } = await postJsonToApi({
      url,
      headers: combineHeaders(this.config.headers(), options.headers),
      body,
      failedResponseHandler: openaiFailedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(
        z.object({
          id: z.string(),
          created_at: z.number(),
          error: z
            .object({
              message: z.string(),
              code: z.string(),
            })
            .nullish(),
          model: z.string(),
          output: z.array(
            z.discriminatedUnion('type', [
              z.object({
                type: z.literal('message'),
                role: z.literal('assistant'),
                content: z.array(
                  z.object({
                    type: z.literal('output_text'),
                    text: z.string(),
                    annotations: z.array(
                      z.object({
                        type: z.literal('url_citation'),
                        start_index: z.number(),
                        end_index: z.number(),
                        url: z.string(),
                        title: z.string(),
                      }),
                    ),
                  }),
                ),
              }),
              z.object({
                type: z.literal('function_call'),
                call_id: z.string(),
                name: z.string(),
                arguments: z.string(),
              }),
              z.object({
                type: z.literal('web_search_call'),
              }),
              z.object({
                type: z.literal('computer_call'),
              }),
              z.object({
                type: z.literal('reasoning'),
                summary: z.array(
                  z.object({
                    type: z.literal('summary_text'),
                    text: z.string(),
                  }),
                ),
              }),
            ]),
          ),
          incomplete_details: z.object({ reason: z.string() }).nullable(),
          usage: usageSchema,
        }),
      ),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch,
    });

    if (response.error) {
      throw new APICallError({
        message: response.error.message,
        url,
        requestBodyValues: body,
        statusCode: 400,
        responseHeaders,
        responseBody: rawResponse as string,
        isRetryable: false,
      });
    }

    const outputTextElements = response.output
      .filter(output => output.type === 'message')
      .flatMap(output => output.content)
      .filter(content => content.type === 'output_text');

    const toolCalls = response.output
      .filter(output => output.type === 'function_call')
      .map(output => ({
        toolCallType: 'function' as const,
        toolCallId: output.call_id,
        toolName: output.name,
        args: output.arguments,
      }));

    const reasoningSummary =
      response.output.find(item => item.type === 'reasoning')?.summary ?? null;

    return {
      text: outputTextElements.map(content => content.text).join('\n'),
      sources: outputTextElements.flatMap(content =>
        content.annotations.map(annotation => ({
          sourceType: 'url',
          id: this.config.generateId?.() ?? generateId(),
          url: annotation.url,
          title: annotation.title,
        })),
      ),
      finishReason: mapOpenAIResponseFinishReason({
        finishReason: response.incomplete_details?.reason,
        hasToolCalls: toolCalls.length > 0,
      }),
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      reasoning: reasoningSummary
        ? reasoningSummary.map(summary => ({
            type: 'text' as const,
            text: summary.text,
          }))
        : undefined,
      usage: {
        promptTokens: response.usage.input_tokens,
        completionTokens: response.usage.output_tokens,
      },
      rawCall: {
        rawPrompt: undefined,
        rawSettings: {},
      },
      rawResponse: {
        headers: responseHeaders,
        body: rawResponse,
      },
      request: {
        body: JSON.stringify(body),
      },
      response: {
        id: response.id,
        timestamp: new Date(response.created_at * 1000),
        modelId: response.model,
      },
      providerMetadata: {
        openai: {
          responseId: response.id,
          cachedPromptTokens:
            response.usage.input_tokens_details?.cached_tokens ?? null,
          reasoningTokens:
            response.usage.output_tokens_details?.reasoning_tokens ?? null,
        },
      },
      warnings,
    };
  }

  async doStream(
    options: Parameters<LanguageModelV1['doStream']>[0],
  ): Promise<Awaited<ReturnType<LanguageModelV1['doStream']>>> {
    const { args: body, warnings } = this.getArgs(options);

    const { responseHeaders, value: response } = await postJsonToApi({
      url: this.config.url({
        path: '/responses',
        modelId: this.modelId,
      }),
      headers: combineHeaders(this.config.headers(), options.headers),
      body: {
        ...body,
        stream: true,
      },
      failedResponseHandler: openaiFailedResponseHandler,
      successfulResponseHandler: createEventSourceResponseHandler(
        openaiResponsesChunkSchema,
      ),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch,
    });

    const self = this;

    let finishReason: LanguageModelV1FinishReason = 'unknown';
    let promptTokens = NaN;
    let completionTokens = NaN;
    let cachedPromptTokens: number | null = null;
    let reasoningTokens: number | null = null;
    let responseId: string | null = null;
    const ongoingToolCalls: Record<
      number,
      { toolName: string; toolCallId: string } | undefined
    > = {};
    let hasToolCalls = false;

    return {
      stream: response.pipeThrough(
        new TransformStream<
          ParseResult<z.infer<typeof openaiResponsesChunkSchema>>,
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

            if (isResponseOutputItemAddedChunk(value)) {
              if (value.item.type === 'function_call') {
                ongoingToolCalls[value.output_index] = {
                  toolName: value.item.name,
                  toolCallId: value.item.call_id,
                };

                controller.enqueue({
                  type: 'tool-call-delta',
                  toolCallType: 'function',
                  toolCallId: value.item.call_id,
                  toolName: value.item.name,
                  argsTextDelta: value.item.arguments,
                });
              }
            } else if (isResponseFunctionCallArgumentsDeltaChunk(value)) {
              const toolCall = ongoingToolCalls[value.output_index];

              if (toolCall != null) {
                controller.enqueue({
                  type: 'tool-call-delta',
                  toolCallType: 'function',
                  toolCallId: toolCall.toolCallId,
                  toolName: toolCall.toolName,
                  argsTextDelta: value.delta,
                });
              }
            } else if (isResponseCreatedChunk(value)) {
              responseId = value.response.id;
              controller.enqueue({
                type: 'response-metadata',
                id: value.response.id,
                timestamp: new Date(value.response.created_at * 1000),
                modelId: value.response.model,
              });
            } else if (isTextDeltaChunk(value)) {
              controller.enqueue({
                type: 'text-delta',
                textDelta: value.delta,
              });
            } else if (isResponseReasoningSummaryTextDeltaChunk(value)) {
              controller.enqueue({
                type: 'reasoning',
                textDelta: value.delta,
              });
            } else if (
              isResponseOutputItemDoneChunk(value) &&
              value.item.type === 'function_call'
            ) {
              ongoingToolCalls[value.output_index] = undefined;
              hasToolCalls = true;
              controller.enqueue({
                type: 'tool-call',
                toolCallType: 'function',
                toolCallId: value.item.call_id,
                toolName: value.item.name,
                args: value.item.arguments,
              });
            } else if (isResponseFinishedChunk(value)) {
              finishReason = mapOpenAIResponseFinishReason({
                finishReason: value.response.incomplete_details?.reason,
                hasToolCalls,
              });
              promptTokens = value.response.usage.input_tokens;
              completionTokens = value.response.usage.output_tokens;
              cachedPromptTokens =
                value.response.usage.input_tokens_details?.cached_tokens ??
                cachedPromptTokens;
              reasoningTokens =
                value.response.usage.output_tokens_details?.reasoning_tokens ??
                reasoningTokens;
            } else if (isResponseAnnotationAddedChunk(value)) {
              controller.enqueue({
                type: 'source',
                source: {
                  sourceType: 'url',
                  id: self.config.generateId?.() ?? generateId(),
                  url: value.annotation.url,
                  title: value.annotation.title,
                },
              });
            } else if (isErrorChunk(value)) {
              controller.enqueue({ type: 'error', error: value });
            }
          },

          flush(controller) {
            controller.enqueue({
              type: 'finish',
              finishReason,
              usage: { promptTokens, completionTokens },
              ...((cachedPromptTokens != null || reasoningTokens != null) && {
                providerMetadata: {
                  openai: {
                    responseId,
                    cachedPromptTokens,
                    reasoningTokens,
                  },
                },
              }),
            });
          },
        }),
      ),
      rawCall: {
        rawPrompt: undefined,
        rawSettings: {},
      },
      rawResponse: { headers: responseHeaders },
      request: { body: JSON.stringify(body) },
      warnings,
    };
  }
}

const usageSchema = z.object({
  input_tokens: z.number(),
  input_tokens_details: z
    .object({ cached_tokens: z.number().nullish() })
    .nullish(),
  output_tokens: z.number(),
  output_tokens_details: z
    .object({ reasoning_tokens: z.number().nullish() })
    .nullish(),
});

const textDeltaChunkSchema = z.object({
  type: z.literal('response.output_text.delta'),
  delta: z.string(),
});

const responseFinishedChunkSchema = z.object({
  type: z.enum(['response.completed', 'response.incomplete']),
  response: z.object({
    incomplete_details: z.object({ reason: z.string() }).nullish(),
    usage: usageSchema,
  }),
});

const responseCreatedChunkSchema = z.object({
  type: z.literal('response.created'),
  response: z.object({
    id: z.string(),
    created_at: z.number(),
    model: z.string(),
  }),
});

const responseOutputItemDoneSchema = z.object({
  type: z.literal('response.output_item.done'),
  output_index: z.number(),
  item: z.discriminatedUnion('type', [
    z.object({
      type: z.literal('message'),
    }),
    z.object({
      type: z.literal('function_call'),
      id: z.string(),
      call_id: z.string(),
      name: z.string(),
      arguments: z.string(),
      status: z.literal('completed'),
    }),
  ]),
});

const responseFunctionCallArgumentsDeltaSchema = z.object({
  type: z.literal('response.function_call_arguments.delta'),
  item_id: z.string(),
  output_index: z.number(),
  delta: z.string(),
});

const responseOutputItemAddedSchema = z.object({
  type: z.literal('response.output_item.added'),
  output_index: z.number(),
  item: z.discriminatedUnion('type', [
    z.object({
      type: z.literal('message'),
    }),
    z.object({
      type: z.literal('function_call'),
      id: z.string(),
      call_id: z.string(),
      name: z.string(),
      arguments: z.string(),
    }),
  ]),
});

const responseAnnotationAddedSchema = z.object({
  type: z.literal('response.output_text.annotation.added'),
  annotation: z.object({
    type: z.literal('url_citation'),
    url: z.string(),
    title: z.string(),
  }),
});

const responseReasoningSummaryTextDeltaSchema = z.object({
  type: z.literal('response.reasoning_summary_text.delta'),
  item_id: z.string(),
  output_index: z.number(),
  summary_index: z.number(),
  delta: z.string(),
});

const errorChunkSchema = z.object({
  type: z.literal('error'),
  code: z.string(),
  message: z.string(),
  param: z.string().nullish(),
  sequence_number: z.number(),
});

const openaiResponsesChunkSchema = z.union([
  textDeltaChunkSchema,
  responseFinishedChunkSchema,
  responseCreatedChunkSchema,
  responseOutputItemDoneSchema,
  responseFunctionCallArgumentsDeltaSchema,
  responseOutputItemAddedSchema,
  responseAnnotationAddedSchema,
  responseReasoningSummaryTextDeltaSchema,
  errorChunkSchema,
  z.object({ type: z.string() }).passthrough(), // fallback for unknown chunks
]);

function isTextDeltaChunk(
  chunk: z.infer<typeof openaiResponsesChunkSchema>,
): chunk is z.infer<typeof textDeltaChunkSchema> {
  return chunk.type === 'response.output_text.delta';
}

function isResponseOutputItemDoneChunk(
  chunk: z.infer<typeof openaiResponsesChunkSchema>,
): chunk is z.infer<typeof responseOutputItemDoneSchema> {
  return chunk.type === 'response.output_item.done';
}

function isResponseFinishedChunk(
  chunk: z.infer<typeof openaiResponsesChunkSchema>,
): chunk is z.infer<typeof responseFinishedChunkSchema> {
  return (
    chunk.type === 'response.completed' || chunk.type === 'response.incomplete'
  );
}

function isResponseCreatedChunk(
  chunk: z.infer<typeof openaiResponsesChunkSchema>,
): chunk is z.infer<typeof responseCreatedChunkSchema> {
  return chunk.type === 'response.created';
}

function isResponseFunctionCallArgumentsDeltaChunk(
  chunk: z.infer<typeof openaiResponsesChunkSchema>,
): chunk is z.infer<typeof responseFunctionCallArgumentsDeltaSchema> {
  return chunk.type === 'response.function_call_arguments.delta';
}

function isResponseOutputItemAddedChunk(
  chunk: z.infer<typeof openaiResponsesChunkSchema>,
): chunk is z.infer<typeof responseOutputItemAddedSchema> {
  return chunk.type === 'response.output_item.added';
}

function isResponseAnnotationAddedChunk(
  chunk: z.infer<typeof openaiResponsesChunkSchema>,
): chunk is z.infer<typeof responseAnnotationAddedSchema> {
  return chunk.type === 'response.output_text.annotation.added';
}

function isResponseReasoningSummaryTextDeltaChunk(
  chunk: z.infer<typeof openaiResponsesChunkSchema>,
): chunk is z.infer<typeof responseReasoningSummaryTextDeltaSchema> {
  return chunk.type === 'response.reasoning_summary_text.delta';
}

function isErrorChunk(
  chunk: z.infer<typeof openaiResponsesChunkSchema>,
): chunk is z.infer<typeof errorChunkSchema> {
  return chunk.type === 'error';
}

type ResponsesModelConfig = {
  isReasoningModel: boolean;
  systemMessageMode: 'remove' | 'system' | 'developer';
  requiredAutoTruncation: boolean;
};

function getResponsesModelConfig(modelId: string): ResponsesModelConfig {
  // o series reasoning models:
  if (modelId.startsWith('o') || modelId.startsWith('gpt-5')) {
    if (modelId.startsWith('o1-mini') || modelId.startsWith('o1-preview')) {
      return {
        isReasoningModel: true,
        systemMessageMode: 'remove',
        requiredAutoTruncation: false,
      };
    }

    return {
      isReasoningModel: true,
      systemMessageMode: 'developer',
      requiredAutoTruncation: false,
    };
  }

  // gpt models:
  return {
    isReasoningModel: false,
    systemMessageMode: 'system',
    requiredAutoTruncation: false,
  };
}

const openaiResponsesProviderOptionsSchema = z.object({
  metadata: z.any().nullish(),
  parallelToolCalls: z.boolean().nullish(),
  previousResponseId: z.string().nullish(),
  store: z.boolean().nullish(),
  user: z.string().nullish(),
  reasoningEffort: z.string().nullish(),
  strictSchemas: z.boolean().nullish(),
  instructions: z.string().nullish(),
  reasoningSummary: z.string().nullish(),
});

export type OpenAIResponsesProviderOptions = z.infer<
  typeof openaiResponsesProviderOptionsSchema
>;
