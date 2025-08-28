import {
  JSONObject,
  LanguageModelV2,
  LanguageModelV2CallWarning,
  LanguageModelV2Content,
  LanguageModelV2FinishReason,
  LanguageModelV2Reasoning,
  LanguageModelV2StreamPart,
  LanguageModelV2Usage,
  SharedV2ProviderMetadata,
  LanguageModelV2FunctionTool,
} from '@ai-sdk/provider';
import {
  FetchFunction,
  ParseResult,
  Resolvable,
  combineHeaders,
  createJsonErrorResponseHandler,
  createJsonResponseHandler,
  parseProviderOptions,
  postJsonToApi,
  resolve,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';
import {
  BEDROCK_STOP_REASONS,
  BedrockConverseInput,
  BedrockStopReason,
} from './bedrock-api-types';
import {
  BedrockChatModelId,
  bedrockProviderOptions,
} from './bedrock-chat-options';
import { BedrockErrorSchema } from './bedrock-error';
import { createBedrockEventStreamResponseHandler } from './bedrock-event-stream-response-handler';
import { prepareTools } from './bedrock-prepare-tools';
import { convertToBedrockChatMessages } from './convert-to-bedrock-chat-messages';
import { mapBedrockFinishReason } from './map-bedrock-finish-reason';

type BedrockChatConfig = {
  baseUrl: () => string;
  headers: Resolvable<Record<string, string | undefined>>;
  fetch?: FetchFunction;
  generateId: () => string;
};

export class BedrockChatLanguageModel implements LanguageModelV2 {
  readonly specificationVersion = 'v2';
  readonly provider = 'amazon-bedrock';

  constructor(
    readonly modelId: BedrockChatModelId,
    private readonly config: BedrockChatConfig,
  ) {}

  private async getArgs({
    prompt,
    maxOutputTokens,
    temperature,
    topP,
    topK,
    frequencyPenalty,
    presencePenalty,
    stopSequences,
    responseFormat,
    seed,
    tools,
    toolChoice,
    providerOptions,
  }: Parameters<LanguageModelV2['doGenerate']>[0]): Promise<{
    command: BedrockConverseInput;
    warnings: LanguageModelV2CallWarning[];
    usesJsonResponseTool: boolean;
    betas: Set<string>;
  }> {
    // Parse provider options
    const bedrockOptions =
      (await parseProviderOptions({
        provider: 'bedrock',
        providerOptions,
        schema: bedrockProviderOptions,
      })) ?? {};

    const warnings: LanguageModelV2CallWarning[] = [];

    if (frequencyPenalty != null) {
      warnings.push({
        type: 'unsupported-setting',
        setting: 'frequencyPenalty',
      });
    }

    if (presencePenalty != null) {
      warnings.push({
        type: 'unsupported-setting',
        setting: 'presencePenalty',
      });
    }

    if (seed != null) {
      warnings.push({
        type: 'unsupported-setting',
        setting: 'seed',
      });
    }

    if (
      responseFormat != null &&
      responseFormat.type !== 'text' &&
      responseFormat.type !== 'json'
    ) {
      warnings.push({
        type: 'unsupported-setting',
        setting: 'responseFormat',
        details: 'Only text and json response formats are supported.',
      });
    }

    if (tools != null && responseFormat?.type === 'json') {
      if (tools.length > 0) {
        warnings.push({
          type: 'other',
          message:
            'JSON response format does not support tools. ' +
            'The provided tools are ignored.',
        });
      }
    }

    const jsonResponseTool: LanguageModelV2FunctionTool | undefined =
      responseFormat?.type === 'json' && responseFormat.schema != null
        ? {
            type: 'function',
            name: 'json',
            description: 'Respond with a JSON object.',
            inputSchema: responseFormat.schema,
          }
        : undefined;

    const { toolConfig, additionalTools, toolWarnings, betas } = prepareTools({
      tools: jsonResponseTool ? [jsonResponseTool, ...(tools ?? [])] : tools,
      toolChoice:
        jsonResponseTool != null
          ? { type: 'tool', toolName: jsonResponseTool.name }
          : toolChoice,
      modelId: this.modelId,
    });

    warnings.push(...toolWarnings);

    if (additionalTools) {
      bedrockOptions.additionalModelRequestFields = {
        ...bedrockOptions.additionalModelRequestFields,
        ...additionalTools,
      };
    }

    const isThinking = bedrockOptions.reasoningConfig?.type === 'enabled';
    const thinkingBudget = bedrockOptions.reasoningConfig?.budgetTokens;

    const inferenceConfig = {
      ...(maxOutputTokens != null && { maxTokens: maxOutputTokens }),
      ...(temperature != null && { temperature }),
      ...(topP != null && { topP }),
      ...(topK != null && { topK }),
      ...(stopSequences != null && { stopSequences }),
    };

    // Adjust maxTokens if thinking is enabled
    if (isThinking && thinkingBudget != null) {
      if (inferenceConfig.maxTokens != null) {
        inferenceConfig.maxTokens += thinkingBudget;
      } else {
        inferenceConfig.maxTokens = thinkingBudget + 4096; // Default + thinking budget maxTokens = 4096, TODO update default in v5
      }
      // Add them to additional model request fields
      // Add thinking config to additionalModelRequestFields
      bedrockOptions.additionalModelRequestFields = {
        ...bedrockOptions.additionalModelRequestFields,
        thinking: {
          type: bedrockOptions.reasoningConfig?.type,
          budget_tokens: thinkingBudget,
        },
      };
    }

    // Remove temperature if thinking is enabled
    if (isThinking && inferenceConfig.temperature != null) {
      delete inferenceConfig.temperature;
      warnings.push({
        type: 'unsupported-setting',
        setting: 'temperature',
        details: 'temperature is not supported when thinking is enabled',
      });
    }

    // Remove topP if thinking is enabled
    if (isThinking && inferenceConfig.topP != null) {
      delete inferenceConfig.topP;
      warnings.push({
        type: 'unsupported-setting',
        setting: 'topP',
        details: 'topP is not supported when thinking is enabled',
      });
    }

    if (isThinking && inferenceConfig.topK != null) {
      delete inferenceConfig.topK;
      warnings.push({
        type: 'unsupported-setting',
        setting: 'topK',
        details: 'topK is not supported when thinking is enabled',
      });
    }

    // Filter tool content from prompt when no tools are available
    const hasAnyTools = (toolConfig.tools?.length ?? 0) > 0 || additionalTools;
    let filteredPrompt = prompt;

    if (!hasAnyTools) {
      const hasToolContent = prompt.some(
        message =>
          'content' in message &&
          Array.isArray(message.content) &&
          message.content.some(
            part => part.type === 'tool-call' || part.type === 'tool-result',
          ),
      );

      if (hasToolContent) {
        filteredPrompt = prompt
          .map(message =>
            message.role === 'system'
              ? message
              : {
                  ...message,
                  content: message.content.filter(
                    part =>
                      part.type !== 'tool-call' && part.type !== 'tool-result',
                  ),
                },
          )
          .filter(
            message => message.role === 'system' || message.content.length > 0,
          ) as typeof prompt;

        warnings.push({
          type: 'unsupported-setting',
          setting: 'toolContent',
          details:
            'Tool calls and results removed from conversation because Bedrock does not support tool content without active tools.',
        });
      }
    }

    const { system, messages } =
      await convertToBedrockChatMessages(filteredPrompt);

    // Filter out reasoningConfig from providerOptions.bedrock to prevent sending it to Bedrock API
    const { reasoningConfig: _, ...filteredBedrockOptions } =
      providerOptions?.bedrock || {};

    return {
      command: {
        system,
        messages,
        additionalModelRequestFields:
          bedrockOptions.additionalModelRequestFields,
        ...(Object.keys(inferenceConfig).length > 0 && {
          inferenceConfig,
        }),
        ...filteredBedrockOptions,
        ...(toolConfig.tools !== undefined && toolConfig.tools.length > 0
          ? { toolConfig }
          : {}),
      },
      warnings,
      usesJsonResponseTool: jsonResponseTool != null,
      betas,
    };
  }

  readonly supportedUrls: Record<string, RegExp[]> = {
    // no supported urls for bedrock
  };

  private async getHeaders({
    betas,
    headers,
  }: {
    betas: Set<string>;
    headers: Record<string, string | undefined> | undefined;
  }) {
    return combineHeaders(
      await resolve(this.config.headers),
      betas.size > 0 ? { 'anthropic-beta': Array.from(betas).join(',') } : {},
      headers,
    );
  }

  async doGenerate(
    options: Parameters<LanguageModelV2['doGenerate']>[0],
  ): Promise<Awaited<ReturnType<LanguageModelV2['doGenerate']>>> {
    const {
      command: args,
      warnings,
      usesJsonResponseTool,
      betas,
    } = await this.getArgs(options);

    const url = `${this.getUrl(this.modelId)}/converse`;
    const { value: response, responseHeaders } = await postJsonToApi({
      url,
      headers: await this.getHeaders({ betas, headers: options.headers }),
      body: args,
      failedResponseHandler: createJsonErrorResponseHandler({
        errorSchema: BedrockErrorSchema,
        errorToMessage: error => `${error.message ?? 'Unknown error'}`,
      }),
      successfulResponseHandler: createJsonResponseHandler(
        BedrockResponseSchema,
      ),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch,
    });

    const content: Array<LanguageModelV2Content> = [];

    // map response content to content array
    for (const part of response.output.message.content) {
      // text
      if (part.text) {
        // when a json response tool is used, the tool call is returned as text,
        // so we ignore the text content:
        if (!usesJsonResponseTool) {
          content.push({ type: 'text', text: part.text });
        }
      }

      // reasoning
      if (part.reasoningContent) {
        if ('reasoningText' in part.reasoningContent) {
          const reasoning: LanguageModelV2Reasoning = {
            type: 'reasoning',
            text: part.reasoningContent.reasoningText.text,
          };

          if (part.reasoningContent.reasoningText.signature) {
            reasoning.providerMetadata = {
              bedrock: {
                signature: part.reasoningContent.reasoningText.signature,
              } satisfies BedrockReasoningMetadata,
            };
          }

          content.push(reasoning);
        } else if ('redactedReasoning' in part.reasoningContent) {
          content.push({
            type: 'reasoning',
            text: '',
            providerMetadata: {
              bedrock: {
                redactedData:
                  part.reasoningContent.redactedReasoning.data ?? '',
              } satisfies BedrockReasoningMetadata,
            },
          });
        }
      }

      // tool calls
      if (part.toolUse) {
        content.push(
          // when a json response tool is used, the tool call becomes the text:
          usesJsonResponseTool
            ? {
                type: 'text',
                text: JSON.stringify(part.toolUse.input),
              }
            : {
                type: 'tool-call' as const,
                toolCallId: part.toolUse?.toolUseId ?? this.config.generateId(),
                toolName:
                  part.toolUse?.name ?? `tool-${this.config.generateId()}`,
                input: JSON.stringify(part.toolUse?.input ?? ''),
              },
        );
      }
    }

    // provider metadata:
    const providerMetadata =
      response.trace || response.usage || usesJsonResponseTool
        ? {
            bedrock: {
              ...(response.trace && typeof response.trace === 'object'
                ? { trace: response.trace as JSONObject }
                : {}),
              ...(response.usage?.cacheWriteInputTokens != null && {
                usage: {
                  cacheWriteInputTokens: response.usage.cacheWriteInputTokens,
                },
              }),
              ...(usesJsonResponseTool && { isJsonResponseFromTool: true }),
            },
          }
        : undefined;

    return {
      content,
      finishReason: mapBedrockFinishReason(
        response.stopReason as BedrockStopReason,
      ),
      usage: {
        inputTokens: response.usage?.inputTokens,
        outputTokens: response.usage?.outputTokens,
        totalTokens: response.usage?.inputTokens + response.usage?.outputTokens,
        cachedInputTokens: response.usage?.cacheReadInputTokens ?? undefined,
      },
      response: {
        // TODO add id, timestamp, etc
        headers: responseHeaders,
      },
      warnings,
      ...(providerMetadata && { providerMetadata }),
    };
  }

  async doStream(
    options: Parameters<LanguageModelV2['doStream']>[0],
  ): Promise<Awaited<ReturnType<LanguageModelV2['doStream']>>> {
    const {
      command: args,
      warnings,
      usesJsonResponseTool,
      betas,
    } = await this.getArgs(options);
    const url = `${this.getUrl(this.modelId)}/converse-stream`;

    const { value: response, responseHeaders } = await postJsonToApi({
      url,
      headers: await this.getHeaders({ betas, headers: options.headers }),
      body: args,
      failedResponseHandler: createJsonErrorResponseHandler({
        errorSchema: BedrockErrorSchema,
        errorToMessage: error => `${error.type}: ${error.message}`,
      }),
      successfulResponseHandler:
        createBedrockEventStreamResponseHandler(BedrockStreamSchema),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch,
    });

    let finishReason: LanguageModelV2FinishReason = 'unknown';
    const usage: LanguageModelV2Usage = {
      inputTokens: undefined,
      outputTokens: undefined,
      totalTokens: undefined,
    };
    let providerMetadata: SharedV2ProviderMetadata | undefined = undefined;

    const contentBlocks: Record<
      number,
      | {
          type: 'tool-call';
          toolCallId: string;
          toolName: string;
          jsonText: string;
        }
      | { type: 'text' | 'reasoning' }
    > = {};

    return {
      stream: response.pipeThrough(
        new TransformStream<
          ParseResult<z.infer<typeof BedrockStreamSchema>>,
          LanguageModelV2StreamPart
        >({
          start(controller) {
            controller.enqueue({ type: 'stream-start', warnings });
          },

          transform(chunk, controller) {
            function enqueueError(bedrockError: Record<string, any>) {
              finishReason = 'error';
              controller.enqueue({ type: 'error', error: bedrockError });
            }

            // Emit raw chunk if requested (before anything else)
            if (options.includeRawChunks) {
              controller.enqueue({ type: 'raw', rawValue: chunk.rawValue });
            }

            // handle failed chunk parsing / validation:
            if (!chunk.success) {
              enqueueError(chunk.error);
              return;
            }

            const value = chunk.value;

            // handle errors:
            if (value.internalServerException) {
              enqueueError(value.internalServerException);
              return;
            }
            if (value.modelStreamErrorException) {
              enqueueError(value.modelStreamErrorException);
              return;
            }
            if (value.throttlingException) {
              enqueueError(value.throttlingException);
              return;
            }
            if (value.validationException) {
              enqueueError(value.validationException);
              return;
            }

            if (value.messageStop) {
              finishReason = mapBedrockFinishReason(
                value.messageStop.stopReason as BedrockStopReason,
              );
            }

            if (value.metadata) {
              usage.inputTokens =
                value.metadata.usage?.inputTokens ?? usage.inputTokens;
              usage.outputTokens =
                value.metadata.usage?.outputTokens ?? usage.outputTokens;
              usage.totalTokens =
                (usage.inputTokens ?? 0) + (usage.outputTokens ?? 0);
              usage.cachedInputTokens =
                value.metadata.usage?.cacheReadInputTokens ??
                usage.cachedInputTokens;

              const cacheUsage =
                value.metadata.usage?.cacheWriteInputTokens != null
                  ? {
                      usage: {
                        cacheWriteInputTokens:
                          value.metadata.usage.cacheWriteInputTokens,
                      },
                    }
                  : undefined;

              const trace = value.metadata.trace
                ? {
                    trace: value.metadata.trace as JSONObject,
                  }
                : undefined;

              if (cacheUsage || trace || usesJsonResponseTool) {
                providerMetadata = {
                  bedrock: {
                    ...cacheUsage,
                    ...trace,
                    ...(usesJsonResponseTool && {
                      isJsonResponseFromTool: true,
                    }),
                  },
                };
              }
            }

            if (
              value.contentBlockStart?.contentBlockIndex != null &&
              !value.contentBlockStart?.start?.toolUse
            ) {
              const blockIndex = value.contentBlockStart.contentBlockIndex;
              contentBlocks[blockIndex] = { type: 'text' };
              controller.enqueue({
                type: 'text-start',
                id: String(blockIndex),
              });
            }

            if (
              value.contentBlockDelta?.delta &&
              'text' in value.contentBlockDelta.delta &&
              value.contentBlockDelta.delta.text
            ) {
              const blockIndex = value.contentBlockDelta.contentBlockIndex || 0;

              if (contentBlocks[blockIndex] == null) {
                contentBlocks[blockIndex] = { type: 'text' };

                // when a json response tool is used, we don't emit text events
                if (!usesJsonResponseTool) {
                  controller.enqueue({
                    type: 'text-start',
                    id: String(blockIndex),
                  });
                }
              }

              // when a json response tool is used, we don't emit text events
              if (!usesJsonResponseTool) {
                controller.enqueue({
                  type: 'text-delta',
                  id: String(blockIndex),
                  delta: value.contentBlockDelta.delta.text,
                });
              }
            }

            if (value.contentBlockStop?.contentBlockIndex != null) {
              const blockIndex = value.contentBlockStop.contentBlockIndex;
              const contentBlock = contentBlocks[blockIndex];

              if (contentBlock != null) {
                if (contentBlock.type === 'reasoning') {
                  controller.enqueue({
                    type: 'reasoning-end',
                    id: String(blockIndex),
                  });
                } else if (contentBlock.type === 'text') {
                  // when a json response tool is used, we don't emit text events
                  if (!usesJsonResponseTool) {
                    controller.enqueue({
                      type: 'text-end',
                      id: String(blockIndex),
                    });
                  }
                } else if (contentBlock.type === 'tool-call') {
                  if (usesJsonResponseTool) {
                    // when a json response tool is used, emit the tool input as text
                    controller.enqueue({
                      type: 'text-start',
                      id: String(blockIndex),
                    });
                    controller.enqueue({
                      type: 'text-delta',
                      id: String(blockIndex),
                      delta: contentBlock.jsonText,
                    });
                    controller.enqueue({
                      type: 'text-end',
                      id: String(blockIndex),
                    });
                  } else {
                    controller.enqueue({
                      type: 'tool-input-end',
                      id: contentBlock.toolCallId,
                    });
                    controller.enqueue({
                      type: 'tool-call',
                      toolCallId: contentBlock.toolCallId,
                      toolName: contentBlock.toolName,
                      input: contentBlock.jsonText,
                    });
                  }
                }

                delete contentBlocks[blockIndex];
              }
            }

            if (
              value.contentBlockDelta?.delta &&
              'reasoningContent' in value.contentBlockDelta.delta &&
              value.contentBlockDelta.delta.reasoningContent
            ) {
              const blockIndex = value.contentBlockDelta.contentBlockIndex || 0;
              const reasoningContent =
                value.contentBlockDelta.delta.reasoningContent;

              if ('text' in reasoningContent && reasoningContent.text) {
                if (contentBlocks[blockIndex] == null) {
                  contentBlocks[blockIndex] = { type: 'reasoning' };
                  controller.enqueue({
                    type: 'reasoning-start',
                    id: String(blockIndex),
                  });
                }

                controller.enqueue({
                  type: 'reasoning-delta',
                  id: String(blockIndex),
                  delta: reasoningContent.text,
                });
              } else if (
                'signature' in reasoningContent &&
                reasoningContent.signature
              ) {
                controller.enqueue({
                  type: 'reasoning-delta',
                  id: String(blockIndex),
                  delta: '',
                  providerMetadata: {
                    bedrock: {
                      signature: reasoningContent.signature,
                    } satisfies BedrockReasoningMetadata,
                  },
                });
              } else if ('data' in reasoningContent && reasoningContent.data) {
                controller.enqueue({
                  type: 'reasoning-delta',
                  id: String(blockIndex),
                  delta: '',
                  providerMetadata: {
                    bedrock: {
                      redactedData: reasoningContent.data,
                    } satisfies BedrockReasoningMetadata,
                  },
                });
              }
            }

            const contentBlockStart = value.contentBlockStart;
            if (contentBlockStart?.start?.toolUse != null) {
              const toolUse = contentBlockStart.start.toolUse;
              const blockIndex = contentBlockStart.contentBlockIndex!;
              contentBlocks[blockIndex] = {
                type: 'tool-call',
                toolCallId: toolUse.toolUseId!,
                toolName: toolUse.name!,
                jsonText: '',
              };

              // when a json response tool is used, we don't emit tool events
              if (!usesJsonResponseTool) {
                controller.enqueue({
                  type: 'tool-input-start',
                  id: toolUse.toolUseId!,
                  toolName: toolUse.name!,
                });
              }
            }

            const contentBlockDelta = value.contentBlockDelta;
            if (
              contentBlockDelta?.delta &&
              'toolUse' in contentBlockDelta.delta &&
              contentBlockDelta.delta.toolUse
            ) {
              const blockIndex = contentBlockDelta.contentBlockIndex!;
              const contentBlock = contentBlocks[blockIndex];

              if (contentBlock?.type === 'tool-call') {
                const delta = contentBlockDelta.delta.toolUse.input ?? '';

                // when a json response tool is used, we don't emit tool events
                if (!usesJsonResponseTool) {
                  controller.enqueue({
                    type: 'tool-input-delta',
                    id: contentBlock.toolCallId,
                    delta: delta,
                  });
                }

                contentBlock.jsonText += delta;
              }
            }
          },
          flush(controller) {
            controller.enqueue({
              type: 'finish',
              finishReason,
              usage,
              ...(providerMetadata && { providerMetadata }),
            });
          },
        }),
      ),
      // TODO request?
      response: { headers: responseHeaders },
    };
  }

  private getUrl(modelId: string) {
    const encodedModelId = encodeURIComponent(modelId);
    return `${this.config.baseUrl()}/model/${encodedModelId}`;
  }
}

const BedrockStopReasonSchema = z.union([
  z.enum(BEDROCK_STOP_REASONS),
  z.string(),
]);

const BedrockToolUseSchema = z.object({
  toolUseId: z.string(),
  name: z.string(),
  input: z.unknown(),
});

const BedrockReasoningTextSchema = z.object({
  signature: z.string().nullish(),
  text: z.string(),
});

const BedrockRedactedReasoningSchema = z.object({
  data: z.string(),
});

// limited version of the schema, focused on what is needed for the implementation
// this approach limits breakages when the API changes and increases efficiency
const BedrockResponseSchema = z.object({
  metrics: z
    .object({
      latencyMs: z.number(),
    })
    .nullish(),
  output: z.object({
    message: z.object({
      content: z.array(
        z.object({
          text: z.string().nullish(),
          toolUse: BedrockToolUseSchema.nullish(),
          reasoningContent: z
            .union([
              z.object({
                reasoningText: BedrockReasoningTextSchema,
              }),
              z.object({
                redactedReasoning: BedrockRedactedReasoningSchema,
              }),
            ])
            .nullish(),
        }),
      ),
      role: z.string(),
    }),
  }),
  stopReason: BedrockStopReasonSchema,
  trace: z.unknown().nullish(),
  usage: z.object({
    inputTokens: z.number(),
    outputTokens: z.number(),
    totalTokens: z.number(),
    cacheReadInputTokens: z.number().nullish(),
    cacheWriteInputTokens: z.number().nullish(),
  }),
});

// limited version of the schema, focussed on what is needed for the implementation
// this approach limits breakages when the API changes and increases efficiency
const BedrockStreamSchema = z.object({
  contentBlockDelta: z
    .object({
      contentBlockIndex: z.number(),
      delta: z
        .union([
          z.object({ text: z.string() }),
          z.object({ toolUse: z.object({ input: z.string() }) }),
          z.object({
            reasoningContent: z.object({ text: z.string() }),
          }),
          z.object({
            reasoningContent: z.object({
              signature: z.string(),
            }),
          }),
          z.object({
            reasoningContent: z.object({ data: z.string() }),
          }),
        ])
        .nullish(),
    })
    .nullish(),
  contentBlockStart: z
    .object({
      contentBlockIndex: z.number(),
      start: z
        .object({
          toolUse: BedrockToolUseSchema.nullish(),
        })
        .nullish(),
    })
    .nullish(),
  contentBlockStop: z
    .object({
      contentBlockIndex: z.number(),
    })
    .nullish(),
  internalServerException: z.record(z.string(), z.unknown()).nullish(),
  messageStop: z
    .object({
      additionalModelResponseFields: z
        .record(z.string(), z.unknown())
        .nullish(),
      stopReason: BedrockStopReasonSchema,
    })
    .nullish(),
  metadata: z
    .object({
      trace: z.unknown().nullish(),
      usage: z
        .object({
          cacheReadInputTokens: z.number().nullish(),
          cacheWriteInputTokens: z.number().nullish(),
          inputTokens: z.number(),
          outputTokens: z.number(),
        })
        .nullish(),
    })
    .nullish(),
  modelStreamErrorException: z.record(z.string(), z.unknown()).nullish(),
  throttlingException: z.record(z.string(), z.unknown()).nullish(),
  validationException: z.record(z.string(), z.unknown()).nullish(),
});

export const bedrockReasoningMetadataSchema = z.object({
  signature: z.string().optional(),
  redactedData: z.string().optional(),
});

export type BedrockReasoningMetadata = z.infer<
  typeof bedrockReasoningMetadataSchema
>;
