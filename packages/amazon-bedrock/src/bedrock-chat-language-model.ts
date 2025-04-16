import {
  JSONObject,
  LanguageModelV2,
  LanguageModelV2CallWarning,
  LanguageModelV2Content,
  LanguageModelV2FinishReason,
  LanguageModelV2StreamPart,
  LanguageModelV2Usage,
  SharedV2ProviderMetadata,
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
import { z } from 'zod';
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
  readonly defaultObjectGenerationMode = 'tool';
  readonly supportsImageUrls = false;

  constructor(
    readonly modelId: BedrockChatModelId,
    private readonly config: BedrockChatConfig,
  ) {}

  private getArgs({
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
  }: Parameters<LanguageModelV2['doGenerate']>[0]): {
    command: BedrockConverseInput;
    warnings: LanguageModelV2CallWarning[];
  } {
    // Parse provider options
    const bedrockOptions =
      parseProviderOptions({
        provider: 'bedrock',
        providerOptions,
        schema: bedrockProviderOptions,
      }) ?? {};

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

    if (topK != null) {
      warnings.push({
        type: 'unsupported-setting',
        setting: 'topK',
      });
    }

    if (responseFormat != null && responseFormat.type !== 'text') {
      warnings.push({
        type: 'unsupported-setting',
        setting: 'responseFormat',
        details: 'JSON response format is not supported.',
      });
    }

    const { system, messages } = convertToBedrockChatMessages(prompt);

    const isThinking = bedrockOptions.reasoningConfig?.type === 'enabled';
    const thinkingBudget = bedrockOptions.reasoningConfig?.budgetTokens;

    const inferenceConfig = {
      ...(maxOutputTokens != null && { maxOutputTokens }),
      ...(temperature != null && { temperature }),
      ...(topP != null && { topP }),
      ...(stopSequences != null && { stopSequences }),
    };

    // Adjust maxOutputTokens if thinking is enabled
    if (isThinking && thinkingBudget != null) {
      if (inferenceConfig.maxOutputTokens != null) {
        inferenceConfig.maxOutputTokens += thinkingBudget;
      } else {
        inferenceConfig.maxOutputTokens = thinkingBudget + 4096; // Default + thinking budget maxOutputTokens = 4096, TODO update default in v5
      }
      // Add them to additional model request fields
      // Add reasoning config to additionalModelRequestFields
      bedrockOptions.additionalModelRequestFields = {
        ...bedrockOptions.additionalModelRequestFields,
        reasoningConfig: {
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

    const { toolConfig, toolWarnings } = prepareTools({ tools, toolChoice });
    return {
      command: {
        system,
        messages,
        additionalModelRequestFields:
          bedrockOptions.additionalModelRequestFields,
        ...(Object.keys(inferenceConfig).length > 0 && {
          inferenceConfig,
        }),
        ...providerOptions?.bedrock,
        ...(toolConfig.tools?.length ? { toolConfig } : {}),
      },
      warnings: [...warnings, ...toolWarnings],
    };
  }

  async doGenerate(
    options: Parameters<LanguageModelV2['doGenerate']>[0],
  ): Promise<Awaited<ReturnType<LanguageModelV2['doGenerate']>>> {
    const { command: args, warnings } = this.getArgs(options);

    const url = `${this.getUrl(this.modelId)}/converse`;
    const { value: response, responseHeaders } = await postJsonToApi({
      url,
      headers: combineHeaders(
        await resolve(this.config.headers),
        options.headers,
      ),
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
        content.push({ type: 'text', text: part.text });
      }

      // reasoning
      if (part.reasoningContent) {
        if ('reasoningText' in part.reasoningContent) {
          content.push({
            type: 'reasoning',
            reasoningType: 'text',
            text: part.reasoningContent.reasoningText.text,
          });
          if (part.reasoningContent.reasoningText.signature) {
            content.push({
              type: 'reasoning',
              reasoningType: 'signature',
              signature: part.reasoningContent.reasoningText.signature,
            });
          }
        } else if ('redactedReasoning' in part.reasoningContent) {
          content.push({
            type: 'reasoning',
            reasoningType: 'redacted',
            data: part.reasoningContent.redactedReasoning.data ?? '',
          });
        }
      }

      // tool calls
      if (part.toolUse) {
        content.push({
          type: 'tool-call' as const,
          toolCallType: 'function',
          toolCallId: part.toolUse?.toolUseId ?? this.config.generateId(),
          toolName: part.toolUse?.name ?? `tool-${this.config.generateId()}`,
          args: JSON.stringify(part.toolUse?.input ?? ''),
        });
      }
    }

    // provider metadata:
    const providerMetadata =
      response.trace || response.usage
        ? {
            bedrock: {
              ...(response.trace && typeof response.trace === 'object'
                ? { trace: response.trace as JSONObject }
                : {}),
              ...(response.usage && {
                usage: {
                  cacheReadInputTokens:
                    response.usage?.cacheReadInputTokens ?? Number.NaN,
                  cacheWriteInputTokens:
                    response.usage?.cacheWriteInputTokens ?? Number.NaN,
                },
              }),
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
    const { command: args, warnings } = this.getArgs(options);
    const url = `${this.getUrl(this.modelId)}/converse-stream`;

    const { value: response, responseHeaders } = await postJsonToApi({
      url,
      headers: combineHeaders(
        await resolve(this.config.headers),
        options.headers,
      ),
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
    };
    let providerMetadata: SharedV2ProviderMetadata | undefined = undefined;

    const toolCallContentBlocks: Record<
      number,
      {
        toolCallId: string;
        toolName: string;
        jsonText: string;
      }
    > = {};

    return {
      stream: response.pipeThrough(
        new TransformStream<
          ParseResult<z.infer<typeof BedrockStreamSchema>>,
          LanguageModelV2StreamPart
        >({
          transform(chunk, controller) {
            function enqueueError(bedrockError: Record<string, any>) {
              finishReason = 'error';
              controller.enqueue({ type: 'error', error: bedrockError });
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

              const cacheUsage =
                value.metadata.usage?.cacheReadInputTokens != null ||
                value.metadata.usage?.cacheWriteInputTokens != null
                  ? {
                      usage: {
                        cacheReadInputTokens:
                          value.metadata.usage?.cacheReadInputTokens ??
                          Number.NaN,
                        cacheWriteInputTokens:
                          value.metadata.usage?.cacheWriteInputTokens ??
                          Number.NaN,
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
              value.contentBlockDelta?.delta &&
              'text' in value.contentBlockDelta.delta &&
              value.contentBlockDelta.delta.text
            ) {
              controller.enqueue({
                type: 'text',
                text: value.contentBlockDelta.delta.text,
              });
            }

            if (
              value.contentBlockDelta?.delta &&
              'reasoningContent' in value.contentBlockDelta.delta &&
              value.contentBlockDelta.delta.reasoningContent
            ) {
              const reasoningContent =
                value.contentBlockDelta.delta.reasoningContent;
              if ('text' in reasoningContent && reasoningContent.text) {
                controller.enqueue({
                  type: 'reasoning',
                  reasoningType: 'text',
                  text: reasoningContent.text,
                });
              } else if (
                'signature' in reasoningContent &&
                reasoningContent.signature
              ) {
                controller.enqueue({
                  type: 'reasoning',
                  reasoningType: 'signature',
                  signature: reasoningContent.signature,
                });
              } else if ('data' in reasoningContent && reasoningContent.data) {
                controller.enqueue({
                  type: 'reasoning',
                  reasoningType: 'redacted',
                  data: reasoningContent.data,
                });
              }
            }

            const contentBlockStart = value.contentBlockStart;
            if (contentBlockStart?.start?.toolUse != null) {
              const toolUse = contentBlockStart.start.toolUse;
              toolCallContentBlocks[contentBlockStart.contentBlockIndex!] = {
                toolCallId: toolUse.toolUseId!,
                toolName: toolUse.name!,
                jsonText: '',
              };
            }

            const contentBlockDelta = value.contentBlockDelta;
            if (
              contentBlockDelta?.delta &&
              'toolUse' in contentBlockDelta.delta &&
              contentBlockDelta.delta.toolUse
            ) {
              const contentBlock =
                toolCallContentBlocks[contentBlockDelta.contentBlockIndex!];
              const delta = contentBlockDelta.delta.toolUse.input ?? '';

              controller.enqueue({
                type: 'tool-call-delta',
                toolCallType: 'function',
                toolCallId: contentBlock.toolCallId,
                toolName: contentBlock.toolName,
                argsTextDelta: delta,
              });

              contentBlock.jsonText += delta;
            }

            const contentBlockStop = value.contentBlockStop;
            if (contentBlockStop != null) {
              const index = contentBlockStop.contentBlockIndex!;
              const contentBlock = toolCallContentBlocks[index];

              // when finishing a tool call block, send the full tool call:
              if (contentBlock != null) {
                controller.enqueue({
                  type: 'tool-call',
                  toolCallType: 'function',
                  toolCallId: contentBlock.toolCallId,
                  toolName: contentBlock.toolName,
                  args: contentBlock.jsonText,
                });

                delete toolCallContentBlocks[index];
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
      response: { headers: responseHeaders },
      warnings,
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
  internalServerException: z.record(z.unknown()).nullish(),
  messageStop: z
    .object({
      additionalModelResponseFields: z.record(z.unknown()).nullish(),
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
  modelStreamErrorException: z.record(z.unknown()).nullish(),
  throttlingException: z.record(z.unknown()).nullish(),
  validationException: z.record(z.unknown()).nullish(),
});
