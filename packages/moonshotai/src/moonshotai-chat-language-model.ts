import {
  InvalidResponseDataError,
  type APICallError,
  type LanguageModelV3,
  type LanguageModelV3CallOptions,
  type LanguageModelV3Content,
  type LanguageModelV3FinishReason,
  type LanguageModelV3GenerateResult,
  type LanguageModelV3StreamPart,
  type LanguageModelV3StreamResult,
  type SharedV3Warning,
} from '@ai-sdk/provider';
import {
  combineHeaders,
  createEventSourceResponseHandler,
  createJsonErrorResponseHandler,
  createJsonResponseHandler,
  generateId,
  parseProviderOptions,
  postJsonToApi,
  type FetchFunction,
  type InferSchema,
  type ParseResult,
  type ResponseHandler,
} from '@ai-sdk/provider-utils';
import { convertToMoonshotAIChatMessages } from './convert-to-moonshotai-chat-messages';
import { convertMoonshotAIChatUsage } from './convert-moonshotai-chat-usage';
import { getResponseMetadata } from './get-response-metadata';
import { mapMoonshotAIFinishReason } from './map-moonshotai-finish-reason';
import {
  moonshotAIChatChunkSchema,
  moonshotAIChatResponseSchema,
  moonshotAIErrorSchema,
  type MoonshotAIChatLogprob,
  type MoonshotAIChatTokenUsage,
} from './moonshotai-chat-api-types';
import {
  getMoonshotAIModelFamily,
  isMoonshotAIKimiModel,
  moonshotaiLanguageModelOptions,
  type MoonshotAIChatModelId,
} from './moonshotai-chat-options';
import { normalizeJsonSchemaForMFJS } from './normalize-json-schema-for-mfjs';
import { prepareTools } from './moonshotai-prepare-tools';

export type MoonshotAIChatConfig = {
  provider: string;
  headers?: () => Record<string, string | undefined>;
  url: (options: { modelId: string; path: string }) => string;
  fetch?: FetchFunction;
  includeUsage?: boolean;
  supportsStructuredOutputs?: boolean;
};

export class MoonshotAIChatLanguageModel implements LanguageModelV3 {
  readonly specificationVersion = 'v3';

  readonly modelId: MoonshotAIChatModelId;

  // Moonshot AI does not fetch external URLs; the AI SDK downloads and
  // inlines URL file parts instead. ms:// file references from the Moonshot
  // Files API are passed through natively.
  readonly supportedUrls = {
    'image/*': [/^ms:\/\//],
    'video/*': [/^ms:\/\//],
  };

  private readonly config: MoonshotAIChatConfig;
  private readonly failedResponseHandler: ResponseHandler<APICallError>;

  constructor(modelId: MoonshotAIChatModelId, config: MoonshotAIChatConfig) {
    this.modelId = modelId;
    this.config = config;

    this.failedResponseHandler = createJsonErrorResponseHandler({
      errorSchema: moonshotAIErrorSchema,
      errorToMessage: error => error.error.message,
    });
  }

  get provider(): string {
    return this.config.provider;
  }

  private get providerOptionsName(): string {
    return this.config.provider.split('.')[0].trim();
  }

  private async getArgs({
    prompt,
    maxOutputTokens,
    temperature,
    topP,
    topK,
    frequencyPenalty,
    presencePenalty,
    providerOptions,
    stopSequences,
    responseFormat,
    seed,
    toolChoice,
    tools,
  }: LanguageModelV3CallOptions) {
    const moonshotOptions =
      (await parseProviderOptions({
        provider: this.providerOptionsName,
        providerOptions,
        schema: moonshotaiLanguageModelOptions,
      })) ?? {};

    const allWarnings: SharedV3Warning[] = [];
    if (topK != null) {
      allWarnings.push({ type: 'unsupported', feature: 'topK' });
    }
    if (seed != null) {
      allWarnings.push({ type: 'unsupported', feature: 'seed' });
    }

    const supportsSamplingOptions = !isMoonshotAIKimiModel(this.modelId);

    if (!supportsSamplingOptions && temperature != null) {
      allWarnings.push({
        type: 'unsupported',
        feature: 'temperature',
        details: `temperature is fixed by model "${this.modelId}" and has been omitted.`,
      });
    }
    if (!supportsSamplingOptions && topP != null) {
      allWarnings.push({
        type: 'unsupported',
        feature: 'topP',
        details: `topP is fixed by model "${this.modelId}" and has been omitted.`,
      });
    }
    if (!supportsSamplingOptions && frequencyPenalty != null) {
      allWarnings.push({
        type: 'unsupported',
        feature: 'frequencyPenalty',
        details: `frequencyPenalty is fixed by model "${this.modelId}" and has been omitted.`,
      });
    }
    if (!supportsSamplingOptions && presencePenalty != null) {
      allWarnings.push({
        type: 'unsupported',
        feature: 'presencePenalty',
        details: `presencePenalty is fixed by model "${this.modelId}" and has been omitted.`,
      });
    }

    const {
      tools: moonshotTools,
      toolChoice: moonshotToolChoice,
      toolWarnings,
    } = prepareTools({ tools, toolChoice, modelId: this.modelId });

    const modelFamily = getMoonshotAIModelFamily(this.modelId);
    const requestedThinking = moonshotOptions.thinking;
    const requestedReasoningEffort = moonshotOptions.reasoningEffort;
    const preserveReasoning = moonshotOptions.reasoningHistory === 'preserved';

    if (requestedThinking?.budgetTokens != null) {
      allWarnings.push({
        type: 'other',
        message:
          'providerOptions.moonshotai.thinking.budgetTokens is deprecated because Moonshot Chat Completions does not support budget_tokens. The option has been omitted.',
      });
    }

    let thinking: { type: 'enabled' | 'disabled'; keep?: 'all' } | undefined;
    let reasoningEffort: 'low' | 'high' | 'max' | undefined;

    const warnUnsupportedReasoningEffort = () => {
      if (requestedReasoningEffort != null) {
        allWarnings.push({
          type: 'unsupported',
          feature: 'reasoningEffort',
          details: `reasoningEffort is only supported by Kimi K3 and has been omitted for model "${this.modelId}".`,
        });
      }
    };

    switch (modelFamily) {
      case 'kimi-k3': {
        if (requestedThinking != null) {
          allWarnings.push({
            type: 'unsupported',
            feature: 'thinking',
            details:
              'Kimi K3 always reasons and does not accept the thinking field. The option has been omitted.',
          });
        }
        reasoningEffort = requestedReasoningEffort;
        break;
      }
      case 'kimi-k2.7': {
        warnUnsupportedReasoningEffort();
        if (requestedThinking?.type === 'disabled') {
          allWarnings.push({
            type: 'unsupported',
            feature: 'thinking.type "disabled"',
            details: 'Kimi K2.7 thinking cannot be disabled.',
          });
        } else if (requestedThinking?.type === 'enabled') {
          thinking = { type: 'enabled' };
        }
        break;
      }
      case 'kimi-k2.6': {
        warnUnsupportedReasoningEffort();
        const thinkingType = requestedThinking?.type;
        if (thinkingType != null || preserveReasoning) {
          thinking = {
            type: thinkingType ?? 'enabled',
            ...(preserveReasoning ? { keep: 'all' as const } : {}),
          };
        }
        break;
      }
      case 'kimi-k2.5': {
        warnUnsupportedReasoningEffort();
        const thinkingType = requestedThinking?.type;
        if (thinkingType != null) {
          thinking = { type: thinkingType };
        }
        if (preserveReasoning) {
          allWarnings.push({
            type: 'unsupported',
            feature: `reasoningHistory 'preserved' is not supported by model "${this.modelId}"`,
          });
        }
        break;
      }
      case 'moonshot-v1': {
        warnUnsupportedReasoningEffort();
        if (requestedThinking != null) {
          allWarnings.push({
            type: 'unsupported',
            feature: 'thinking',
            details: `thinking is not supported by model "${this.modelId}" and has been omitted.`,
          });
        }
        if (preserveReasoning) {
          allWarnings.push({
            type: 'unsupported',
            feature: `reasoningHistory 'preserved' is not supported by model "${this.modelId}"`,
          });
        }
        break;
      }
      case 'unknown': {
        reasoningEffort = requestedReasoningEffort;
        if (requestedThinking?.type != null) {
          thinking = { type: requestedThinking.type };
        }
        if (preserveReasoning) {
          allWarnings.push({
            type: 'unsupported',
            feature: `reasoningHistory 'preserved' is not supported by model "${this.modelId}"`,
          });
        }
        break;
      }
    }

    let response_format: Record<string, unknown> | undefined;
    if (responseFormat?.type === 'json') {
      if (
        this.config.supportsStructuredOutputs === true &&
        responseFormat.schema != null
      ) {
        // kimi-k2.5 produces nonsensical output when the top-level `$schema`
        // keyword injected by the AI SDK is present, even though it otherwise
        // supports structured outputs. Strip it from the schema sent to
        // Moonshot; the full original schema is still used for result
        // validation.
        const { $schema: _$schema, ...schemaWithoutDollarSchema } =
          responseFormat.schema;
        response_format = {
          type: 'json_schema',
          json_schema: {
            name: responseFormat.name ?? 'response',
            strict: moonshotOptions.strictJsonSchema ?? true,
            schema: normalizeJsonSchemaForMFJS(schemaWithoutDollarSchema),
          },
        };
      } else {
        response_format = { type: 'json_object' };
      }
    }

    const { messages, warnings: messageWarnings } =
      convertToMoonshotAIChatMessages({
        modelId: this.modelId,
        prompt,
        providerOptionsName: this.providerOptionsName,
        responseFormat: response_format,
      });
    allWarnings.push(...messageWarnings);

    return {
      args: {
        model: this.modelId,
        ...((moonshotOptions.logprobs === true ||
          moonshotOptions.topLogprobs != null) && { logprobs: true }),
        ...(moonshotOptions.topLogprobs != null && {
          top_logprobs: moonshotOptions.topLogprobs,
        }),
        max_completion_tokens: maxOutputTokens,
        temperature: supportsSamplingOptions ? temperature : undefined,
        top_p: supportsSamplingOptions ? topP : undefined,
        frequency_penalty: supportsSamplingOptions
          ? frequencyPenalty
          : undefined,
        presence_penalty: supportsSamplingOptions ? presencePenalty : undefined,
        response_format,
        stop: stopSequences,
        messages,
        tools: moonshotTools,
        tool_choice: moonshotToolChoice,
        ...(moonshotOptions.prediction != null && {
          prediction: moonshotOptions.prediction,
        }),
        ...(thinking != null ? { thinking } : {}),
        ...(reasoningEffort != null && {
          reasoning_effort: reasoningEffort,
        }),
        ...(moonshotOptions.promptCacheKey != null && {
          prompt_cache_key: moonshotOptions.promptCacheKey,
        }),
        ...(moonshotOptions.safetyIdentifier != null && {
          safety_identifier: moonshotOptions.safetyIdentifier,
        }),
      },
      warnings: [...allWarnings, ...toolWarnings],
    };
  }

  async doGenerate(
    options: LanguageModelV3CallOptions,
  ): Promise<LanguageModelV3GenerateResult> {
    const { args, warnings } = await this.getArgs({ ...options });

    const {
      responseHeaders,
      value: responseBody,
      rawValue: rawResponse,
    } = await postJsonToApi({
      url: this.config.url({
        path: '/chat/completions',
        modelId: this.modelId,
      }),
      headers: combineHeaders(this.config.headers?.(), options.headers),
      body: args,
      failedResponseHandler: this.failedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(
        moonshotAIChatResponseSchema,
      ),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch,
    });

    const choice = responseBody.choices[0];
    const content: Array<LanguageModelV3Content> = [];

    // reasoning content (before text):
    const reasoning = choice.message.reasoning_content;
    if (reasoning != null && reasoning.length > 0) {
      content.push({ type: 'reasoning', text: reasoning });
    }

    // tool calls:
    if (choice.message.tool_calls != null) {
      for (const toolCall of choice.message.tool_calls) {
        content.push({
          type: 'tool-call',
          toolCallId: toolCall.id ?? generateId(),
          toolName: toolCall.function.name,
          input: toolCall.function.arguments ?? '',
        });
      }
    }

    // text content:
    const text = choice.message.content;
    if (text != null && text.length > 0) {
      content.push({ type: 'text', text });
    }

    return {
      content,
      finishReason: {
        unified: mapMoonshotAIFinishReason(choice.finish_reason),
        raw: choice.finish_reason ?? undefined,
      },
      usage: convertMoonshotAIChatUsage(responseBody.usage),
      providerMetadata: {
        [this.providerOptionsName]: {
          ...(responseBody.object != null && {
            responseObject: responseBody.object,
          }),
          ...(choice.index != null && { choiceIndex: choice.index }),
          ...(choice.message.role != null && {
            messageRole: choice.message.role,
          }),
          ...(choice.message.tool_calls != null && {
            toolCallTypes: choice.message.tool_calls
              .map(toolCall => toolCall.type)
              .filter(type => type != null),
          }),
          ...(choice.logprobs != null && { logprobs: choice.logprobs }),
        },
      },
      request: { body: args },
      response: {
        ...getResponseMetadata(responseBody),
        headers: responseHeaders,
        body: rawResponse,
      },
      warnings,
    };
  }

  async doStream(
    options: LanguageModelV3CallOptions,
  ): Promise<LanguageModelV3StreamResult> {
    const { args, warnings } = await this.getArgs({ ...options });

    const body = {
      ...args,
      stream: true,
      ...(this.config.includeUsage && {
        stream_options: { include_usage: true },
      }),
    };

    const { responseHeaders, value: response } = await postJsonToApi({
      url: this.config.url({
        path: '/chat/completions',
        modelId: this.modelId,
      }),
      headers: combineHeaders(this.config.headers?.(), options.headers),
      body,
      failedResponseHandler: this.failedResponseHandler,
      successfulResponseHandler: createEventSourceResponseHandler(
        moonshotAIChatChunkSchema,
      ),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch,
    });

    const toolCalls: Array<{
      id: string;
      type: 'function';
      function: { name: string; arguments: string };
      hasFinished: boolean;
    }> = [];

    let finishReason: LanguageModelV3FinishReason = {
      unified: 'other',
      raw: undefined,
    };
    let topLevelUsage: MoonshotAIChatTokenUsage | undefined = undefined;
    let choiceUsage: MoonshotAIChatTokenUsage | undefined = undefined;
    const contentLogprobs: MoonshotAIChatLogprob[] = [];
    const providerOptionsName = this.providerOptionsName;
    let isFirstChunk = true;
    let isActiveReasoning = false;
    let isActiveText = false;
    let responseObject: 'chat.completion.chunk' | undefined;
    let choiceIndex: number | undefined;
    let messageRole: 'assistant' | undefined;
    const toolCallTypes = new Map<number, 'function'>();

    return {
      stream: response.pipeThrough(
        new TransformStream<
          ParseResult<InferSchema<typeof moonshotAIChatChunkSchema>>,
          LanguageModelV3StreamPart
        >({
          start(controller) {
            controller.enqueue({ type: 'stream-start', warnings });
          },

          transform(chunk, controller) {
            // emit raw chunk if requested (before anything else):
            if (options.includeRawChunks) {
              controller.enqueue({ type: 'raw', rawValue: chunk.rawValue });
            }

            // handle failed chunk parsing / validation:
            if (!chunk.success) {
              finishReason = { unified: 'error', raw: undefined };
              controller.enqueue({ type: 'error', error: chunk.error });
              return;
            }
            const value = chunk.value;

            // handle error chunks:
            if ('error' in value) {
              finishReason = { unified: 'error', raw: undefined };
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
              topLevelUsage = value.usage;
            }

            if (value.object != null) {
              responseObject = value.object;
            }

            const choice = value.choices[0];

            if (choice?.usage != null) {
              choiceUsage = choice.usage;
            }

            if (choice?.index != null) {
              choiceIndex = choice.index;
            }

            if (choice?.finish_reason != null) {
              finishReason = {
                unified: mapMoonshotAIFinishReason(choice.finish_reason),
                raw: choice.finish_reason,
              };
            }

            if (choice?.logprobs?.content != null) {
              contentLogprobs.push(...choice.logprobs.content);
            }

            if (choice?.delta == null) {
              return;
            }

            const delta = choice.delta;

            if (delta.role != null) {
              messageRole = delta.role;
            }

            // enqueue reasoning before text deltas:
            const reasoningContent = delta.reasoning_content;
            if (reasoningContent) {
              if (!isActiveReasoning) {
                controller.enqueue({
                  type: 'reasoning-start',
                  id: 'reasoning-0',
                });
                isActiveReasoning = true;
              }

              controller.enqueue({
                type: 'reasoning-delta',
                id: 'reasoning-0',
                delta: reasoningContent,
              });
            }

            if (delta.content) {
              if (!isActiveText) {
                controller.enqueue({ type: 'text-start', id: 'txt-0' });
                isActiveText = true;
              }

              // end reasoning when text starts:
              if (isActiveReasoning) {
                controller.enqueue({
                  type: 'reasoning-end',
                  id: 'reasoning-0',
                });
                isActiveReasoning = false;
              }

              controller.enqueue({
                type: 'text-delta',
                id: 'txt-0',
                delta: delta.content,
              });
            }

            if (delta.tool_calls != null) {
              // end reasoning when tool calls start:
              if (isActiveReasoning) {
                controller.enqueue({
                  type: 'reasoning-end',
                  id: 'reasoning-0',
                });
                isActiveReasoning = false;
              }

              for (const [
                fallbackIndex,
                toolCallDelta,
              ] of delta.tool_calls.entries()) {
                const index = toolCallDelta.index ?? fallbackIndex;

                if (toolCallDelta.type != null) {
                  toolCallTypes.set(index, toolCallDelta.type);
                }

                if (toolCalls[index] == null) {
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

                  controller.enqueue({
                    type: 'tool-input-start',
                    id: toolCallDelta.id,
                    toolName: toolCallDelta.function.name,
                  });

                  toolCalls[index] = {
                    id: toolCallDelta.id,
                    type: 'function',
                    function: {
                      name: toolCallDelta.function.name,
                      arguments: toolCallDelta.function.arguments ?? '',
                    },
                    hasFinished: false,
                  };

                  const toolCall = toolCalls[index];

                  if (
                    toolCall.function?.name != null &&
                    toolCall.function?.arguments != null &&
                    toolCall.function.arguments.length > 0
                  ) {
                    // send delta if the argument text has already started:
                    controller.enqueue({
                      type: 'tool-input-delta',
                      id: toolCall.id,
                      delta: toolCall.function.arguments,
                    });
                  }

                  continue;
                }

                // existing tool call, merge if not finished
                const toolCall = toolCalls[index];

                if (toolCall.hasFinished) {
                  continue;
                }

                if (toolCallDelta.function?.arguments != null) {
                  toolCall.function.arguments +=
                    toolCallDelta.function.arguments;
                }

                // send delta
                controller.enqueue({
                  type: 'tool-input-delta',
                  id: toolCall.id,
                  delta: toolCallDelta.function.arguments ?? '',
                });
              }
            }
          },

          flush(controller) {
            if (isActiveReasoning) {
              controller.enqueue({ type: 'reasoning-end', id: 'reasoning-0' });
            }

            if (isActiveText) {
              controller.enqueue({ type: 'text-end', id: 'txt-0' });
            }

            // go through all tool calls and send the ones that are not finished
            for (const toolCall of toolCalls.filter(
              toolCall => !toolCall.hasFinished,
            )) {
              controller.enqueue({
                type: 'tool-input-end',
                id: toolCall.id,
              });

              controller.enqueue({
                type: 'tool-call',
                toolCallId: toolCall.id,
                toolName: toolCall.function.name,
                input: toolCall.function.arguments,
              });
            }

            controller.enqueue({
              type: 'finish',
              finishReason,
              usage: convertMoonshotAIChatUsage(topLevelUsage ?? choiceUsage),
              providerMetadata: {
                [providerOptionsName]: {
                  ...(responseObject != null && { responseObject }),
                  ...(choiceIndex != null && { choiceIndex }),
                  ...(messageRole != null && { messageRole }),
                  ...(toolCallTypes.size > 0 && {
                    toolCallTypes: [...toolCallTypes.entries()]
                      .sort(([left], [right]) => left - right)
                      .map(([, type]) => type),
                  }),
                  ...(contentLogprobs.length > 0 && {
                    logprobs: {
                      content: contentLogprobs,
                    },
                  }),
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
