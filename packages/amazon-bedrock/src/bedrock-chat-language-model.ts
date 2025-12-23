import {
  JSONObject,
  LanguageModelV3,
  LanguageModelV3CallOptions,
  LanguageModelV3Content,
  LanguageModelV3FinishReason,
  LanguageModelV3FunctionTool,
  LanguageModelV3GenerateResult,
  LanguageModelV3Reasoning,
  LanguageModelV3StreamPart,
  LanguageModelV3StreamResult,
  SharedV3ProviderMetadata,
  SharedV3Warning,
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
import { BedrockUsage, convertBedrockUsage } from './convert-bedrock-usage';
import { convertToBedrockChatMessages } from './convert-to-bedrock-chat-messages';
import { mapBedrockFinishReason } from './map-bedrock-finish-reason';

type BedrockChatConfig = {
  baseUrl: () => string;
  headers: Resolvable<Record<string, string | undefined>>;
  fetch?: FetchFunction;
  generateId: () => string;
};

export class BedrockChatLanguageModel implements LanguageModelV3 {
  readonly specificationVersion = 'v3';
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
  }: LanguageModelV3CallOptions): Promise<{
    command: BedrockConverseInput;
    warnings: SharedV3Warning[];
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

    const warnings: SharedV3Warning[] = [];

    if (frequencyPenalty != null) {
      warnings.push({
        type: 'unsupported',
        feature: 'frequencyPenalty',
      });
    }

    if (presencePenalty != null) {
      warnings.push({
        type: 'unsupported',
        feature: 'presencePenalty',
      });
    }

    if (seed != null) {
      warnings.push({
        type: 'unsupported',
        feature: 'seed',
      });
    }

    if (temperature != null && temperature > 1) {
      warnings.push({
        type: 'unsupported',
        feature: 'temperature',
        details: `${temperature} exceeds bedrock maximum of 1.0. clamped to 1.0`,
      });
      temperature = 1;
    } else if (temperature != null && temperature < 0) {
      warnings.push({
        type: 'unsupported',
        feature: 'temperature',
        details: `${temperature} is below bedrock minimum of 0. clamped to 0`,
      });
      temperature = 0;
    }

    if (
      responseFormat != null &&
      responseFormat.type !== 'text' &&
      responseFormat.type !== 'json'
    ) {
      warnings.push({
        type: 'unsupported',
        feature: 'responseFormat',
        details: 'Only text and json response formats are supported.',
      });
    }

    const jsonResponseTool: LanguageModelV3FunctionTool | undefined =
      responseFormat?.type === 'json' && responseFormat.schema != null
        ? {
            type: 'function',
            name: 'json',
            description: 'Respond with a JSON object.',
            inputSchema: responseFormat.schema,
          }
        : undefined;

    const { toolConfig, additionalTools, toolWarnings, betas } =
      await prepareTools({
        tools: jsonResponseTool ? [...(tools ?? []), jsonResponseTool] : tools,
        toolChoice:
          jsonResponseTool != null ? { type: 'required' } : toolChoice,
        modelId: this.modelId,
      });

    warnings.push(...toolWarnings);

    if (additionalTools) {
      bedrockOptions.additionalModelRequestFields = {
        ...bedrockOptions.additionalModelRequestFields,
        ...additionalTools,
      };
    }

    if (betas.size > 0 || bedrockOptions.anthropicBeta) {
      const existingBetas = bedrockOptions.anthropicBeta ?? [];
      const mergedBetas =
        betas.size > 0
          ? [...existingBetas, ...Array.from(betas)]
          : existingBetas;

      bedrockOptions.additionalModelRequestFields = {
        ...bedrockOptions.additionalModelRequestFields,
        anthropic_beta: mergedBetas,
      };
    }

    const isAnthropicModel = this.modelId.includes('anthropic');
    const isThinkingRequested =
      bedrockOptions.reasoningConfig?.type === 'enabled';
    const thinkingBudget = bedrockOptions.reasoningConfig?.budgetTokens;
    const isAnthropicThinkingEnabled = isAnthropicModel && isThinkingRequested;

    const inferenceConfig = {
      ...(maxOutputTokens != null && { maxTokens: maxOutputTokens }),
      ...(temperature != null && { temperature }),
      ...(topP != null && { topP }),
      ...(topK != null && { topK }),
      ...(stopSequences != null && { stopSequences }),
    };

    if (isAnthropicThinkingEnabled && thinkingBudget != null) {
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
    } else if (!isAnthropicModel && thinkingBudget != null) {
      warnings.push({
        type: 'unsupported',
        feature: 'budgetTokens',
        details:
          'budgetTokens applies only to Anthropic models on Bedrock and will be ignored for this model.',
      });
    }

    const maxReasoningEffort =
      bedrockOptions.reasoningConfig?.maxReasoningEffort;
    if (maxReasoningEffort != null && !isAnthropicModel) {
      bedrockOptions.additionalModelRequestFields = {
        ...bedrockOptions.additionalModelRequestFields,
        reasoningConfig: {
          ...(bedrockOptions.reasoningConfig?.type != null && {
            type: bedrockOptions.reasoningConfig.type,
          }),
          maxReasoningEffort,
        },
      };
    } else if (maxReasoningEffort != null && isAnthropicModel) {
      warnings.push({
        type: 'unsupported',
        feature: 'maxReasoningEffort',
        details:
          'maxReasoningEffort applies only to Amazon Nova models on Bedrock and will be ignored for this model.',
      });
    }

    if (isAnthropicThinkingEnabled && inferenceConfig.temperature != null) {
      delete inferenceConfig.temperature;
      warnings.push({
        type: 'unsupported',
        feature: 'temperature',
        details: 'temperature is not supported when thinking is enabled',
      });
    }

    if (isAnthropicThinkingEnabled && inferenceConfig.topP != null) {
      delete inferenceConfig.topP;
      warnings.push({
        type: 'unsupported',
        feature: 'topP',
        details: 'topP is not supported when thinking is enabled',
      });
    }

    if (isAnthropicThinkingEnabled && inferenceConfig.topK != null) {
      delete inferenceConfig.topK;
      warnings.push({
        type: 'unsupported',
        feature: 'topK',
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
          type: 'unsupported',
          feature: 'toolContent',
          details:
            'Tool calls and results removed from conversation because Bedrock does not support tool content without active tools.',
        });
      }
    }

    const { system, messages } =
      await convertToBedrockChatMessages(filteredPrompt);

    // Filter out reasoningConfig from providerOptions.bedrock to prevent sending it to Bedrock API
    const {
      reasoningConfig: _,
      additionalModelRequestFields: __,
      ...filteredBedrockOptions
    } = providerOptions?.bedrock || {};

    return {
      command: {
        system,
        messages,
        additionalModelRequestFields:
          bedrockOptions.additionalModelRequestFields,
        additionalModelResponseFieldPaths: ['/stop_sequence'],
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
    headers,
  }: {
    headers: Record<string, string | undefined> | undefined;
  }) {
    return combineHeaders(await resolve(this.config.headers), headers);
  }

  async doGenerate(
    options: LanguageModelV3CallOptions,
  ): Promise<LanguageModelV3GenerateResult> {
    const {
      command: args,
      warnings,
      usesJsonResponseTool,
    } = await this.getArgs(options);

    const url = `${this.getUrl(this.modelId)}/converse`;
    const { value: response, responseHeaders } = await postJsonToApi({
      url,
      headers: await this.getHeaders({ headers: options.headers }),
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

    const content: Array<LanguageModelV3Content> = [];
    let isJsonResponseFromTool = false;

    // map response content to content array
    for (const part of response.output.message.content) {
      // text
      if (part.text) {
        content.push({ type: 'text', text: part.text });
      }

      // reasoning
      if (part.reasoningContent) {
        if ('reasoningText' in part.reasoningContent) {
          const reasoning: LanguageModelV3Reasoning = {
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
        const isJsonResponseTool =
          usesJsonResponseTool && part.toolUse.name === 'json';

        if (isJsonResponseTool) {
          isJsonResponseFromTool = true;
          // when a json response tool is used, the tool call becomes the text:
          content.push({
            type: 'text',
            text: JSON.stringify(part.toolUse.input),
          });
        } else {
          content.push({
            type: 'tool-call' as const,
            toolCallId: part.toolUse?.toolUseId ?? this.config.generateId(),
            toolName: part.toolUse?.name ?? `tool-${this.config.generateId()}`,
            input: JSON.stringify(part.toolUse?.input ?? {}),
          });
        }
      }
    }

    // provider metadata:
    const stopSequence =
      response.additionalModelResponseFields?.stop_sequence ?? null;

    const providerMetadata =
      response.trace || response.usage || isJsonResponseFromTool || stopSequence
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
              ...(isJsonResponseFromTool && { isJsonResponseFromTool: true }),
              stopSequence,
            },
          }
        : undefined;

    return {
      content,
      finishReason: {
        unified: mapBedrockFinishReason(
          response.stopReason as BedrockStopReason,
          isJsonResponseFromTool,
        ),
        raw: response.stopReason ?? undefined,
      },
      usage: convertBedrockUsage(response.usage),
      response: {
        // TODO add id, timestamp, etc
        headers: responseHeaders,
      },
      warnings,
      ...(providerMetadata && { providerMetadata }),
    };
  }

  async doStream(
    options: LanguageModelV3CallOptions,
  ): Promise<LanguageModelV3StreamResult> {
    const {
      command: args,
      warnings,
      usesJsonResponseTool,
    } = await this.getArgs(options);
    const url = `${this.getUrl(this.modelId)}/converse-stream`;

    const { value: response, responseHeaders } = await postJsonToApi({
      url,
      headers: await this.getHeaders({ headers: options.headers }),
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

    let finishReason: LanguageModelV3FinishReason = {
      unified: 'other',
      raw: undefined,
    };
    let usage: BedrockUsage | undefined = undefined;
    let providerMetadata: SharedV3ProviderMetadata | undefined = undefined;
    let isJsonResponseFromTool = false;
    let stopSequence: string | null = null;

    const contentBlocks: Record<
      number,
      | {
          type: 'tool-call';
          toolCallId: string;
          toolName: string;
          jsonText: string;
          isJsonResponseTool?: boolean;
        }
      | { type: 'text' | 'reasoning' }
    > = {};

    return {
      stream: response.pipeThrough(
        new TransformStream<
          ParseResult<z.infer<typeof BedrockStreamSchema>>,
          LanguageModelV3StreamPart
        >({
          start(controller) {
            controller.enqueue({ type: 'stream-start', warnings });
          },

          transform(chunk, controller) {
            function enqueueError(bedrockError: Record<string, any>) {
              finishReason = { unified: 'error', raw: undefined };
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
              finishReason = {
                unified: mapBedrockFinishReason(
                  value.messageStop.stopReason as BedrockStopReason,
                  isJsonResponseFromTool,
                ),
                raw: value.messageStop.stopReason ?? undefined,
              };
              stopSequence =
                value.messageStop.additionalModelResponseFields
                  ?.stop_sequence ?? null;
            }

            if (value.metadata) {
              if (value.metadata.usage) {
                usage = value.metadata.usage;
              }

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

              if (cacheUsage || trace) {
                providerMetadata = {
                  bedrock: {
                    ...cacheUsage,
                    ...trace,
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

                controller.enqueue({
                  type: 'text-start',
                  id: String(blockIndex),
                });
              }

              controller.enqueue({
                type: 'text-delta',
                id: String(blockIndex),
                delta: value.contentBlockDelta.delta.text,
              });
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
                  controller.enqueue({
                    type: 'text-end',
                    id: String(blockIndex),
                  });
                } else if (contentBlock.type === 'tool-call') {
                  if (contentBlock.isJsonResponseTool) {
                    isJsonResponseFromTool = true;
                    // when this specific tool is the json response tool, emit the tool input as text
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
                      input:
                        contentBlock.jsonText === ''
                          ? '{}'
                          : contentBlock.jsonText,
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
              const isJsonResponseTool =
                usesJsonResponseTool && toolUse.name === 'json';

              contentBlocks[blockIndex] = {
                type: 'tool-call',
                toolCallId: toolUse.toolUseId!,
                toolName: toolUse.name!,
                jsonText: '',
                isJsonResponseTool,
              };

              // when this specific tool is the json response tool, we don't emit tool events
              if (!isJsonResponseTool) {
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

                // when this specific tool is the json response tool, we don't emit tool events
                if (!contentBlock.isJsonResponseTool) {
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
            // Update provider metadata with isJsonResponseFromTool and stopSequence if needed
            if (isJsonResponseFromTool || stopSequence != null) {
              if (providerMetadata) {
                providerMetadata.bedrock = {
                  ...providerMetadata.bedrock,
                  ...(isJsonResponseFromTool && {
                    isJsonResponseFromTool: true,
                  }),
                  stopSequence,
                };
              } else {
                providerMetadata = {
                  bedrock: {
                    ...(isJsonResponseFromTool && {
                      isJsonResponseFromTool: true,
                    }),
                    stopSequence,
                  },
                };
              }
            }

            controller.enqueue({
              type: 'finish',
              finishReason,
              usage: convertBedrockUsage(usage),
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

const BedrockAdditionalModelResponseFieldsSchema = z
  .object({
    stop_sequence: z.string().nullish(),
  })
  .catchall(z.unknown());

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
  additionalModelResponseFields:
    BedrockAdditionalModelResponseFieldsSchema.nullish(),
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
      additionalModelResponseFields:
        BedrockAdditionalModelResponseFieldsSchema.nullish(),
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
