import {
  JSONObject,
  LanguageModelV1,
  LanguageModelV1CallWarning,
  LanguageModelV1FinishReason,
  LanguageModelV1ProviderMetadata,
  LanguageModelV1StreamPart,
  UnsupportedFunctionalityError,
} from '@ai-sdk/provider';
import {
  FetchFunction,
  ParseResult,
  createJsonErrorResponseHandler,
  createJsonResponseHandler,
  postJsonToApi,
  resolve,
} from '@ai-sdk/provider-utils';
import {
  BedrockConverseInput,
  BedrockGuardrailConfiguration,
  BedrockGuardrailStreamConfiguration,
  BedrockHeadersFunction,
  BedrockStopReason,
  BedrockToolInputSchema,
} from './bedrock-api-types';
import {
  BedrockChatModelId,
  BedrockChatSettings,
} from './bedrock-chat-settings';
import { BedrockErrorSchema } from './bedrock-error';
import { createEventSourceResponseHandler } from './bedrock-eventstream-codec';
import { prepareTools } from './bedrock-prepare-tools';
import { convertToBedrockChatMessages } from './convert-to-bedrock-chat-messages';
import { mapBedrockFinishReason } from './map-bedrock-finish-reason';
import { z } from 'zod';

type BedrockChatConfig = {
  baseUrl: () => string;
  headers: BedrockHeadersFunction;
  fetch?: FetchFunction;
  generateId: () => string;
};

export class BedrockChatLanguageModel implements LanguageModelV1 {
  readonly specificationVersion = 'v1';
  readonly provider = 'amazon-bedrock';
  readonly defaultObjectGenerationMode = 'tool';
  readonly supportsImageUrls = false;

  constructor(
    readonly modelId: BedrockChatModelId,
    private readonly settings: BedrockChatSettings,
    private readonly config: BedrockChatConfig,
  ) {}

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
    headers,
  }: Parameters<LanguageModelV1['doGenerate']>[0]): {
    command: BedrockConverseInput;
    warnings: LanguageModelV1CallWarning[];
  } {
    const type = mode.type;

    const warnings: LanguageModelV1CallWarning[] = [];

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

    if (headers != null) {
      warnings.push({
        type: 'unsupported-setting',
        setting: 'headers',
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

    const inferenceConfig = {
      ...(maxTokens != null && { maxTokens }),
      ...(temperature != null && { temperature }),
      ...(topP != null && { topP }),
      ...(stopSequences != null && { stopSequences }),
    };

    const baseArgs: BedrockConverseInput = {
      system: system ? [{ text: system }] : undefined,
      additionalModelRequestFields: this.settings.additionalModelRequestFields,
      ...(Object.keys(inferenceConfig).length > 0 && {
        inferenceConfig,
      }),
      messages,
      guardrailConfig: providerMetadata?.bedrock?.guardrailConfig as
        | BedrockGuardrailConfiguration
        | BedrockGuardrailStreamConfiguration
        | undefined,
    };

    switch (type) {
      case 'regular': {
        const { toolConfig, toolWarnings } = prepareTools(mode);
        return {
          command: {
            ...baseArgs,
            ...(toolConfig.tools?.length ? { toolConfig } : {}),
          },
          warnings: [...warnings, ...toolWarnings],
        };
      }

      case 'object-json': {
        throw new UnsupportedFunctionalityError({
          functionality: 'json-mode object generation',
        });
      }

      case 'object-tool': {
        return {
          command: {
            ...baseArgs,
            toolConfig: {
              tools: [
                {
                  toolSpec: {
                    name: mode.tool.name,
                    description: mode.tool.description,
                    inputSchema: {
                      json: mode.tool.parameters,
                    } as BedrockToolInputSchema,
                  },
                },
              ],
              toolChoice: { tool: { name: mode.tool.name } },
            },
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

  private getUrl(modelId: string) {
    const encodedModelId = encodeURIComponent(modelId);
    return `${this.config.baseUrl()}/model/${encodedModelId}/converse`;
  }

  private getStreamUrl(modelId: string): string {
    const encodedModelId = encodeURIComponent(modelId);
    return `${this.config.baseUrl()}/model/${encodedModelId}/converse-stream`;
  }

  async doGenerate(
    options: Parameters<LanguageModelV1['doGenerate']>[0],
  ): Promise<Awaited<ReturnType<LanguageModelV1['doGenerate']>>> {
    const { command: args, warnings } = this.getArgs(options);

    const url = this.getUrl(this.modelId);
    const { value: response } = await postJsonToApi({
      url,
      headers: await resolve(
        this.config.headers({
          url,
          headers: options.headers ?? {},
          body: args,
        }),
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

    const { messages: rawPrompt, ...rawSettings } = args;

    const providerMetadata = response.trace
      ? { bedrock: { trace: response.trace as JSONObject } }
      : undefined;

    return {
      text:
        response.output?.message?.content
          ?.map(part => part.text ?? '')
          .join('') ?? undefined,
      toolCalls: response.output?.message?.content
        ?.filter(part => !!part.toolUse)
        ?.map(part => ({
          toolCallType: 'function',
          toolCallId: part.toolUse?.toolUseId ?? this.config.generateId(),
          toolName: part.toolUse?.name ?? `tool-${this.config.generateId()}`,
          args: JSON.stringify(part.toolUse?.input ?? ''),
        })),
      finishReason: mapBedrockFinishReason(
        response.stopReason as BedrockStopReason,
      ),
      usage: {
        promptTokens: response.usage?.inputTokens ?? Number.NaN,
        completionTokens: response.usage?.outputTokens ?? Number.NaN,
      },
      rawCall: { rawPrompt, rawSettings },
      warnings,
      ...(providerMetadata && { providerMetadata }),
    };
  }

  async doStream(
    options: Parameters<LanguageModelV1['doStream']>[0],
  ): Promise<Awaited<ReturnType<LanguageModelV1['doStream']>>> {
    const { command: args, warnings } = this.getArgs(options);
    const url = this.getStreamUrl(this.modelId);

    const { value: response } = await postJsonToApi({
      url,
      headers: await resolve(
        this.config.headers({
          url,
          headers: options.headers ?? {},
          body: args,
        }),
      ),
      body: args,
      failedResponseHandler: createJsonErrorResponseHandler({
        errorSchema: BedrockErrorSchema,
        errorToMessage: error => `${error.type}: ${error.message}`,
      }),
      successfulResponseHandler:
        createEventSourceResponseHandler(BedrockStreamSchema),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch,
    });

    const { messages: rawPrompt, ...rawSettings } = args;

    let finishReason: LanguageModelV1FinishReason = 'unknown';
    let usage = {
      promptTokens: Number.NaN,
      completionTokens: Number.NaN,
    };
    let providerMetadata: LanguageModelV1ProviderMetadata | undefined =
      undefined;

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
        new TransformStream<ParseResult<any>, LanguageModelV1StreamPart>({
          transform(chunk, controller) {
            function enqueueError(error: Error) {
              finishReason = 'error';
              controller.enqueue({ type: 'error', error });
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
                value.messageStop.stopReason,
              );
            }

            if (value.metadata) {
              usage = {
                promptTokens: value.metadata.usage?.inputTokens ?? Number.NaN,
                completionTokens:
                  value.metadata.usage?.outputTokens ?? Number.NaN,
              };

              if (value.metadata.trace) {
                providerMetadata = {
                  bedrock: {
                    trace: value.metadata.trace as JSONObject,
                  },
                };
              }
            }

            if (value.contentBlockDelta?.delta?.text) {
              controller.enqueue({
                type: 'text-delta',
                textDelta: value.contentBlockDelta.delta.text,
              });
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
            if (contentBlockDelta?.delta?.toolUse) {
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
      rawCall: { rawPrompt, rawSettings },
      warnings,
    };
  }
}

// limited version of the schema, focussed on what is needed for the implementation
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
          text: z.string().optional(),
          toolUse: z
            .object({
              toolUseId: z.string(),
              name: z.string(),
              input: z.any(),
            })
            .optional(),
        }),
      ),
      role: z.string(),
    }),
  }),
  stopReason: z.string(),
  trace: z.any().nullish(),
  usage: z.object({
    inputTokens: z.number(),
    outputTokens: z.number(),
    totalTokens: z.number(),
  }),
});

// limited version of the schema, focussed on what is needed for the implementation
// this approach limits breakages when the API changes and increases efficiency
const BedrockStreamSchema = z.object({
  contentBlockDelta: z
    .object({
      contentBlockIndex: z.number(),
      delta: z.record(z.any()).nullish(),
    })
    .nullish(),
  contentBlockStart: z
    .object({
      contentBlockIndex: z.number(),
      start: z.record(z.any()).nullish(),
    })
    .nullish(),
  contentBlockStop: z
    .object({
      contentBlockIndex: z.number(),
    })
    .nullish(),
  internalServerException: z.record(z.any()).nullish(),
  messageStop: z
    .object({
      additionalModelResponseFields: z.any().nullish(),
      stopReason: z.string(),
    })
    .nullish(),
  metadata: z
    .object({
      trace: z.any(),
      usage: z
        .object({
          inputTokens: z.number(),
          outputTokens: z.number(),
        })
        .nullish(),
    })
    .nullish(),
  modelStreamErrorException: z.record(z.any()).nullish(),
  throttlingException: z.record(z.any()).nullish(),
  validationException: z.record(z.any()).nullish(),
});
