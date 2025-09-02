import {
  APICallError,
  LanguageModelV2,
  LanguageModelV2CallWarning,
  LanguageModelV2Content,
  LanguageModelV2FinishReason,
  LanguageModelV2StreamPart,
  LanguageModelV2Usage,
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
import { z } from 'zod/v4';
import { HuggingFaceConfig } from '../huggingface-config';
import { huggingfaceFailedResponseHandler } from '../huggingface-error';
import { convertToHuggingFaceResponsesMessages } from './convert-to-huggingface-responses-messages';
import { mapHuggingFaceResponsesFinishReason } from './map-huggingface-responses-finish-reason';
import { HuggingFaceResponsesModelId } from './huggingface-responses-settings';
import { prepareResponsesTools } from './huggingface-responses-prepare-tools';

export class HuggingFaceResponsesLanguageModel implements LanguageModelV2 {
  readonly specificationVersion = 'v2';

  readonly modelId: HuggingFaceResponsesModelId;

  private readonly config: HuggingFaceConfig;

  constructor(modelId: HuggingFaceResponsesModelId, config: HuggingFaceConfig) {
    this.modelId = modelId;
    this.config = config;
  }

  readonly supportedUrls: Record<string, RegExp[]> = {
    'image/*': [/^https?:\/\/.*$/],
  };

  get provider(): string {
    return this.config.provider;
  }

  private async getArgs({
    maxOutputTokens,
    temperature,
    stopSequences,
    topP,
    topK,
    presencePenalty,
    frequencyPenalty,
    seed,
    prompt,
    providerOptions,
    tools,
    toolChoice,
    responseFormat,
  }: Parameters<LanguageModelV2['doGenerate']>[0]) {
    const warnings: LanguageModelV2CallWarning[] = [];

    if (topK != null) {
      warnings.push({ type: 'unsupported-setting', setting: 'topK' });
    }

    if (seed != null) {
      warnings.push({ type: 'unsupported-setting', setting: 'seed' });
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
      warnings.push({ type: 'unsupported-setting', setting: 'stopSequences' });
    }

    const { input, warnings: messageWarnings } =
      await convertToHuggingFaceResponsesMessages({
        prompt,
      });

    warnings.push(...messageWarnings);

    const huggingfaceOptions = await parseProviderOptions({
      provider: 'huggingface',
      providerOptions,
      schema: huggingfaceResponsesProviderOptionsSchema,
    });

    const {
      tools: preparedTools,
      toolChoice: preparedToolChoice,
      toolWarnings,
    } = prepareResponsesTools({
      tools,
      toolChoice,
    });

    warnings.push(...toolWarnings);

    const baseArgs = {
      model: this.modelId,
      input,
      temperature,
      top_p: topP,
      max_output_tokens: maxOutputTokens,

      // HuggingFace Responses API uses text.format for structured output
      ...(responseFormat?.type === 'json' &&
        responseFormat.schema && {
          text: {
            format: {
              type: 'json_schema',
              strict: huggingfaceOptions?.strictJsonSchema ?? false,
              name: responseFormat.name ?? 'response',
              description: responseFormat.description,
              schema: responseFormat.schema,
            },
          },
        }),

      metadata: huggingfaceOptions?.metadata,
      instructions: huggingfaceOptions?.instructions,

      ...(preparedTools && { tools: preparedTools }),
      ...(preparedToolChoice && { tool_choice: preparedToolChoice }),
    };

    return { args: baseArgs, warnings };
  }

  async doGenerate(
    options: Parameters<LanguageModelV2['doGenerate']>[0],
  ): Promise<Awaited<ReturnType<LanguageModelV2['doGenerate']>>> {
    const { args, warnings } = await this.getArgs(options);

    const body = {
      ...args,
      stream: false,
    };

    const url = this.config.url({
      path: '/responses',
      modelId: this.modelId,
    });

    const {
      value: response,
      responseHeaders,
      rawValue: rawResponse,
    } = await postJsonToApi({
      url,
      headers: combineHeaders(this.config.headers(), options.headers),
      body,
      failedResponseHandler: huggingfaceFailedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(
        huggingfaceResponsesResponseSchema,
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

    const content: Array<LanguageModelV2Content> = [];

    // Process output array
    for (const part of response.output) {
      switch (part.type) {
        case 'message': {
          for (const contentPart of part.content) {
            content.push({
              type: 'text',
              text: contentPart.text,
              providerMetadata: {
                huggingface: {
                  itemId: part.id,
                },
              },
            });

            if (contentPart.annotations) {
              for (const annotation of contentPart.annotations) {
                content.push({
                  type: 'source',
                  sourceType: 'url',
                  id: this.config.generateId?.() ?? generateId(),
                  url: annotation.url,
                  title: annotation.title,
                });
              }
            }
          }
          break;
        }

        case 'mcp_call': {
          content.push({
            type: 'tool-call',
            toolCallId: part.id,
            toolName: part.name,
            input: part.arguments,
            providerExecuted: true,
          });

          if (part.output) {
            content.push({
              type: 'tool-result',
              toolCallId: part.id,
              toolName: part.name,
              result: part.output,
              providerExecuted: true,
            });
          }
          break;
        }

        case 'mcp_list_tools': {
          content.push({
            type: 'tool-call',
            toolCallId: part.id,
            toolName: 'list_tools',
            input: `{"server_label": "${part.server_label}"}`,
            providerExecuted: true,
          });

          if (part.tools) {
            content.push({
              type: 'tool-result',
              toolCallId: part.id,
              toolName: 'list_tools',
              result: { tools: part.tools },
              providerExecuted: true,
            });
          }
          break;
        }

        case 'function_call': {
          content.push({
            type: 'tool-call',
            toolCallId: part.call_id,
            toolName: part.name,
            input: part.arguments,
          });

          if (part.output) {
            content.push({
              type: 'tool-result',
              toolCallId: part.call_id,
              toolName: part.name,
              result: part.output,
            });
          }
          break;
        }

        default: {
          break;
        }
      }
    }

    return {
      content,
      finishReason: mapHuggingFaceResponsesFinishReason(
        response.incomplete_details?.reason ?? 'stop',
      ),
      usage: {
        inputTokens: response.usage?.input_tokens ?? 0,
        outputTokens: response.usage?.output_tokens ?? 0,
        totalTokens:
          response.usage?.total_tokens ??
          (response.usage?.input_tokens ?? 0) +
            (response.usage?.output_tokens ?? 0),
      },
      request: { body },
      response: {
        id: response.id,
        timestamp: new Date(response.created_at * 1000),
        modelId: response.model,
        headers: responseHeaders,
        body: rawResponse,
      },
      providerMetadata: {
        huggingface: {
          responseId: response.id,
        },
      },
      warnings,
    };
  }

  async doStream(
    options: Parameters<LanguageModelV2['doStream']>[0],
  ): Promise<Awaited<ReturnType<LanguageModelV2['doStream']>>> {
    const { args, warnings } = await this.getArgs(options);

    const body = {
      ...args,
      stream: true,
    };

    const { value: response, responseHeaders } = await postJsonToApi({
      url: this.config.url({
        path: '/responses',
        modelId: this.modelId,
      }),
      headers: combineHeaders(this.config.headers(), options.headers),
      body,
      failedResponseHandler: huggingfaceFailedResponseHandler,
      successfulResponseHandler: createEventSourceResponseHandler(
        huggingfaceResponsesChunkSchema,
      ),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch,
    });

    let finishReason: LanguageModelV2FinishReason = 'unknown';
    let responseId: string | null = null;
    const usage: LanguageModelV2Usage = {
      inputTokens: undefined,
      outputTokens: undefined,
      totalTokens: undefined,
    };

    return {
      stream: response.pipeThrough(
        new TransformStream<
          ParseResult<z.infer<typeof huggingfaceResponsesChunkSchema>>,
          LanguageModelV2StreamPart
        >({
          start(controller) {
            controller.enqueue({ type: 'stream-start', warnings });
          },

          transform(chunk, controller) {
            if (!chunk.success) {
              finishReason = 'error';
              controller.enqueue({ type: 'error', error: chunk.error });
              return;
            }

            const value = chunk.value;

            if (isResponseCreatedChunk(value)) {
              responseId = value.response.id;
              controller.enqueue({
                type: 'response-metadata',
                id: value.response.id,
                timestamp: new Date(value.response.created_at * 1000),
                modelId: value.response.model,
              });
              return;
            }

            if (isResponseOutputItemAddedChunk(value)) {
              if (
                value.item.type === 'message' &&
                value.item.role === 'assistant'
              ) {
                controller.enqueue({
                  type: 'text-start',
                  id: value.item.id,
                  providerMetadata: {
                    huggingface: {
                      itemId: value.item.id,
                    },
                  },
                });
              } else if (value.item.type === 'function_call') {
                controller.enqueue({
                  type: 'tool-input-start',
                  id: value.item.call_id,
                  toolName: value.item.name,
                });
              }
              return;
            }

            if (isResponseOutputItemDoneChunk(value)) {
              if (
                value.item.type === 'message' &&
                value.item.role === 'assistant'
              ) {
                controller.enqueue({
                  type: 'text-end',
                  id: value.item.id,
                });
              } else if (value.item.type === 'function_call') {
                controller.enqueue({
                  type: 'tool-input-end',
                  id: value.item.call_id,
                });

                controller.enqueue({
                  type: 'tool-call',
                  toolCallId: value.item.call_id,
                  toolName: value.item.name,
                  input: value.item.arguments,
                });

                if (value.item.output) {
                  controller.enqueue({
                    type: 'tool-result',
                    toolCallId: value.item.call_id,
                    toolName: value.item.name,
                    result: value.item.output,
                  });
                }
              }
              return;
            }

            if (isResponseCompletedChunk(value)) {
              responseId = value.response.id;
              finishReason = mapHuggingFaceResponsesFinishReason(
                value.response.incomplete_details?.reason ?? 'stop',
              );
              if (value.response.usage) {
                usage.inputTokens = value.response.usage.input_tokens;
                usage.outputTokens = value.response.usage.output_tokens;
                usage.totalTokens =
                  value.response.usage.total_tokens ??
                  value.response.usage.input_tokens +
                    value.response.usage.output_tokens;
              }
              return;
            }

            if (isTextDeltaChunk(value)) {
              controller.enqueue({
                type: 'text-delta',
                id: value.item_id,
                delta: value.delta,
              });
              return;
            }
          },

          flush(controller) {
            controller.enqueue({
              type: 'finish',
              finishReason,
              usage,
              providerMetadata: {
                huggingface: {
                  responseId,
                },
              },
            });
          },
        }),
      ),
      request: { body },
      response: { headers: responseHeaders },
    };
  }
}

const huggingfaceResponsesProviderOptionsSchema = z.object({
  metadata: z.record(z.string(), z.string()).optional(),
  instructions: z.string().optional(),
  strictJsonSchema: z.boolean().optional(),
});

const huggingfaceResponsesResponseSchema = z.object({
  id: z.string(),
  model: z.string(),
  object: z.string(),
  created_at: z.number(),
  status: z.string(),
  error: z.any().nullable(),
  instructions: z.any().nullable(),
  max_output_tokens: z.any().nullable(),
  metadata: z.any().nullable(),
  tool_choice: z.any(),
  tools: z.array(z.any()),
  temperature: z.number(),
  top_p: z.number(),
  incomplete_details: z
    .object({
      reason: z.string(),
    })
    .nullable()
    .optional(),
  usage: z
    .object({
      input_tokens: z.number(),
      input_tokens_details: z
        .object({
          cached_tokens: z.number(),
        })
        .optional(),
      output_tokens: z.number(),
      output_tokens_details: z
        .object({
          reasoning_tokens: z.number(),
        })
        .optional(),
      total_tokens: z.number(),
    })
    .nullable()
    .optional(),
  output: z.array(z.any()),
  output_text: z.string().nullable().optional(),
});

const responseOutputItemAddedSchema = z.object({
  type: z.literal('response.output_item.added'),
  output_index: z.number(),
  item: z.discriminatedUnion('type', [
    z.object({
      type: z.literal('message'),
      id: z.string(),
      role: z.string().optional(),
      status: z.string().optional(),
      content: z.array(z.any()).optional(),
    }),
    z.object({
      type: z.literal('mcp_list_tools'),
      id: z.string(),
      server_label: z.string(),
      tools: z.array(z.any()).optional(),
      error: z.string().optional(),
    }),
    z.object({
      type: z.literal('mcp_call'),
      id: z.string(),
      server_label: z.string(),
      name: z.string(),
      arguments: z.string(),
      output: z.string().optional(),
      error: z.string().optional(),
    }),
    z.object({
      type: z.literal('function_call'),
      id: z.string(),
      call_id: z.string(),
      name: z.string(),
      arguments: z.string(),
      output: z.string().optional(),
      error: z.string().optional(),
    }),
  ]),
  sequence_number: z.number(),
});

const responseOutputItemDoneSchema = z.object({
  type: z.literal('response.output_item.done'),
  output_index: z.number(),
  item: z.discriminatedUnion('type', [
    z.object({
      type: z.literal('message'),
      id: z.string(),
      role: z.string().optional(),
      status: z.string().optional(),
      content: z.array(z.any()).optional(),
    }),
    z.object({
      type: z.literal('mcp_list_tools'),
      id: z.string(),
      server_label: z.string(),
      tools: z.array(z.any()).optional(),
      error: z.string().optional(),
    }),
    z.object({
      type: z.literal('mcp_call'),
      id: z.string(),
      server_label: z.string(),
      name: z.string(),
      arguments: z.string(),
      output: z.string().optional(),
      error: z.string().optional(),
    }),
    z.object({
      type: z.literal('function_call'),
      id: z.string(),
      call_id: z.string(),
      name: z.string(),
      arguments: z.string(),
      output: z.string().optional(),
      error: z.string().optional(),
    }),
  ]),
  sequence_number: z.number(),
});

const textDeltaChunkSchema = z.object({
  type: z.literal('response.output_text.delta'),
  item_id: z.string(),
  output_index: z.number(),
  content_index: z.number(),
  delta: z.string(),
  sequence_number: z.number(),
});

const responseCompletedChunkSchema = z.object({
  type: z.literal('response.completed'),
  response: huggingfaceResponsesResponseSchema,
  sequence_number: z.number(),
});

const responseCreatedChunkSchema = z.object({
  type: z.literal('response.created'),
  response: z.object({
    id: z.string(),
    object: z.string(),
    created_at: z.number(),
    status: z.string(),
    model: z.string(),
  }),
});

const huggingfaceResponsesChunkSchema = z.union([
  responseOutputItemAddedSchema,
  responseOutputItemDoneSchema,
  textDeltaChunkSchema,
  responseCompletedChunkSchema,
  responseCreatedChunkSchema,
  z.object({ type: z.string() }).loose(), // fallback for unknown chunks
]);

function isResponseOutputItemAddedChunk(
  chunk: z.infer<typeof huggingfaceResponsesChunkSchema>,
): chunk is z.infer<typeof responseOutputItemAddedSchema> {
  return chunk.type === 'response.output_item.added';
}

function isResponseOutputItemDoneChunk(
  chunk: z.infer<typeof huggingfaceResponsesChunkSchema>,
): chunk is z.infer<typeof responseOutputItemDoneSchema> {
  return chunk.type === 'response.output_item.done';
}

function isTextDeltaChunk(
  chunk: z.infer<typeof huggingfaceResponsesChunkSchema>,
): chunk is z.infer<typeof textDeltaChunkSchema> {
  return chunk.type === 'response.output_text.delta';
}

function isResponseCompletedChunk(
  chunk: z.infer<typeof huggingfaceResponsesChunkSchema>,
): chunk is z.infer<typeof responseCompletedChunkSchema> {
  return chunk.type === 'response.completed';
}

function isResponseCreatedChunk(
  chunk: z.infer<typeof huggingfaceResponsesChunkSchema>,
): chunk is z.infer<typeof responseCreatedChunkSchema> {
  return chunk.type === 'response.created';
}
