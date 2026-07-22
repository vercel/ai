import type {
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
  type FetchFunction,
  type ParseResult,
  type Resolvable,
  combineHeaders,
  createJsonErrorResponseHandler,
  createJsonResponseHandler,
  parseProviderOptions,
  postJsonToApi,
  resolve,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';
import {
  type BedrockConverseInput,
  type BedrockStopReason,
  BEDROCK_STOP_REASONS,
} from './bedrock-api-types';
import {
  type BedrockChatModelId,
  bedrockProviderOptions,
} from './bedrock-chat-options';
import { BedrockErrorSchema } from './bedrock-error';
import type { BedrockReasoningMetadata } from './bedrock-reasoning-metadata';
import { createBedrockEventStreamResponseHandler } from './bedrock-event-stream-response-handler';
import { prepareTools } from './bedrock-prepare-tools';
import { convertToBedrockChatMessages } from './convert-to-bedrock-chat-messages';
import { mapBedrockFinishReason } from './map-bedrock-finish-reason';
import {
  isDuplicateKimiK2ToolCallText,
  isSameKimiK2ToolCall,
  parseKimiK2ToolCallText,
} from './parse-kimi-k2-tool-call-text';

type BedrockChatConfig = {
  baseUrl: () => string;
  headers: Resolvable<Record<string, string | undefined>>;
  fetch?: FetchFunction;
  generateId: () => string;
};

const kimiK2ToolCallPrefixes = [
  '<think>',
  '<|tool_calls_section_begin|>',
  '<|tool_call_begin|>',
  '<function=',
];

function processKimiK2TextDelta({
  pendingText,
  delta,
  isToolCallCandidate,
  hasStreamedNonWhitespace,
}: {
  pendingText: string;
  delta: string;
  isToolCallCandidate: boolean;
  hasStreamedNonWhitespace: boolean;
}): {
  streamableText: string;
  pendingText: string;
  isToolCallCandidate: boolean;
} {
  const text = pendingText + delta;

  if (isToolCallCandidate) {
    return {
      streamableText: '',
      pendingText: text,
      isToolCallCandidate: true,
    };
  }

  const firstNonWhitespaceIndex = text.search(/\S/);
  if (
    !hasStreamedNonWhitespace &&
    firstNonWhitespaceIndex !== -1 &&
    text[firstNonWhitespaceIndex] === '{'
  ) {
    return {
      streamableText: '',
      pendingText: text,
      isToolCallCandidate: true,
    };
  }

  const toolCallPrefixIndex = kimiK2ToolCallPrefixes.reduce(
    (earliestIndex, prefix) => {
      const index = text.indexOf(prefix);
      return index !== -1 && (earliestIndex === -1 || index < earliestIndex)
        ? index
        : earliestIndex;
    },
    -1,
  );

  if (toolCallPrefixIndex !== -1) {
    const candidateIndex =
      !hasStreamedNonWhitespace &&
      text.slice(0, toolCallPrefixIndex).trim() === ''
        ? 0
        : toolCallPrefixIndex;

    return {
      streamableText: text.slice(0, candidateIndex),
      pendingText: text.slice(candidateIndex),
      isToolCallCandidate: true,
    };
  }

  if (firstNonWhitespaceIndex === -1 && !hasStreamedNonWhitespace) {
    return {
      streamableText: '',
      pendingText: text,
      isToolCallCandidate: false,
    };
  }

  let partialPrefixIndex = -1;
  for (let index = text.length - 1; index >= 0; index--) {
    const suffix = text.slice(index);
    if (kimiK2ToolCallPrefixes.some(prefix => prefix.startsWith(suffix))) {
      partialPrefixIndex = index;
    }
  }

  if (partialPrefixIndex === -1) {
    return {
      streamableText: text,
      pendingText: '',
      isToolCallCandidate: false,
    };
  }

  const pendingIndex =
    !hasStreamedNonWhitespace && text.slice(0, partialPrefixIndex).trim() === ''
      ? 0
      : partialPrefixIndex;

  return {
    streamableText: text.slice(0, pendingIndex),
    pendingText: text.slice(pendingIndex),
    isToolCallCandidate: false,
  };
}

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

    if (temperature != null && temperature > 1) {
      warnings.push({
        type: 'unsupported-setting',
        setting: 'temperature',
        details: `${temperature} exceeds bedrock maximum of 1.0. clamped to 1.0`,
      });
      temperature = 1;
    } else if (temperature != null && temperature < 0) {
      warnings.push({
        type: 'unsupported-setting',
        setting: 'temperature',
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
        type: 'unsupported-setting',
        setting: 'responseFormat',
        details: 'Only text and json response formats are supported.',
      });
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
    const thinkingType = bedrockOptions.reasoningConfig?.type;
    const isThinkingRequested =
      thinkingType === 'enabled' || thinkingType === 'adaptive';
    const thinkingBudget =
      thinkingType === 'enabled'
        ? bedrockOptions.reasoningConfig?.budgetTokens
        : undefined;
    const thinkingDisplay =
      thinkingType === 'adaptive'
        ? bedrockOptions.reasoningConfig?.display
        : undefined;
    const isAnthropicThinkingEnabled = isAnthropicModel && isThinkingRequested;

    const inferenceConfig = {
      ...(maxOutputTokens != null && { maxTokens: maxOutputTokens }),
      ...(temperature != null && { temperature }),
      ...(topP != null && { topP }),
      ...(topK != null && { topK }),
      ...(stopSequences != null && { stopSequences }),
    };

    if (isAnthropicThinkingEnabled) {
      if (thinkingBudget != null) {
        if (inferenceConfig.maxTokens != null) {
          inferenceConfig.maxTokens += thinkingBudget;
        } else {
          inferenceConfig.maxTokens = thinkingBudget + 4096; // Default + thinking budget maxTokens = 4096, TODO update default in v5
        }
        bedrockOptions.additionalModelRequestFields = {
          ...bedrockOptions.additionalModelRequestFields,
          thinking: {
            type: 'enabled',
            budget_tokens: thinkingBudget,
          },
        };
      } else if (thinkingType === 'adaptive') {
        bedrockOptions.additionalModelRequestFields = {
          ...bedrockOptions.additionalModelRequestFields,
          thinking: {
            type: 'adaptive',
            ...(thinkingDisplay != null && { display: thinkingDisplay }),
          },
        };
      }
    } else if (!isAnthropicModel) {
      if (bedrockOptions.reasoningConfig?.budgetTokens != null) {
        warnings.push({
          type: 'unsupported-setting',
          setting: 'budgetTokens',
          details:
            'budgetTokens applies only to Anthropic models on Bedrock and will be ignored for this model.',
        });
      }
      if (thinkingType === 'adaptive') {
        warnings.push({
          type: 'unsupported-setting',
          setting: 'adaptive thinking',
          details:
            'adaptive thinking type applies only to Anthropic models on Bedrock.',
        });
      }
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
      bedrockOptions.additionalModelRequestFields = {
        ...bedrockOptions.additionalModelRequestFields,
        output_config: {
          effort: maxReasoningEffort,
        },
      };
    }

    if (isAnthropicThinkingEnabled && inferenceConfig.temperature != null) {
      delete inferenceConfig.temperature;
      warnings.push({
        type: 'unsupported-setting',
        setting: 'temperature',
        details: 'temperature is not supported when thinking is enabled',
      });
    }

    if (isAnthropicThinkingEnabled && inferenceConfig.topP != null) {
      delete inferenceConfig.topP;
      warnings.push({
        type: 'unsupported-setting',
        setting: 'topP',
        details: 'topP is not supported when thinking is enabled',
      });
    }

    if (isAnthropicThinkingEnabled && inferenceConfig.topK != null) {
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
    const {
      reasoningConfig: _,
      additionalModelRequestFields: __,
      serviceTier: ___,
      ...filteredBedrockOptions
    } = providerOptions?.bedrock || {};

    const additionalModelResponseFieldPaths = isAnthropicModel
      ? ['/delta/stop_sequence']
      : undefined;

    return {
      command: {
        system,
        messages,
        additionalModelRequestFields:
          bedrockOptions.additionalModelRequestFields,
        ...(additionalModelResponseFieldPaths && {
          additionalModelResponseFieldPaths,
        }),
        ...(Object.keys(inferenceConfig).length > 0 && {
          inferenceConfig,
        }),
        ...(bedrockOptions.serviceTier != null && {
          serviceTier: {
            type: bedrockOptions.serviceTier,
          },
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
    'image/*': [/^s3:\/\//],
  };

  private async getHeaders({
    headers,
  }: {
    headers: Record<string, string | undefined> | undefined;
  }) {
    return combineHeaders(await resolve(this.config.headers), headers);
  }

  async doGenerate(
    options: Parameters<LanguageModelV2['doGenerate']>[0],
  ): Promise<Awaited<ReturnType<LanguageModelV2['doGenerate']>>> {
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

    const content: Array<LanguageModelV2Content> = [];
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
      response.additionalModelResponseFields?.delta?.stop_sequence ?? null;

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
      finishReason: mapBedrockFinishReason(
        response.stopReason as BedrockStopReason,
        isJsonResponseFromTool,
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

    let finishReason: LanguageModelV2FinishReason = 'unknown';
    const usage: LanguageModelV2Usage = {
      inputTokens: undefined,
      outputTokens: undefined,
      totalTokens: undefined,
    };
    let providerMetadata: SharedV2ProviderMetadata | undefined = undefined;
    let isJsonResponseFromTool = false;
    let stopSequence: string | null = null;
    let hasParsedKimiK2ToolCall = false;

    const functionTools =
      options.tools
        ?.filter(
          (tool): tool is LanguageModelV2FunctionTool =>
            tool.type === 'function',
        )
        .map(tool => tool) ?? [];
    const shouldParseKimiK2ToolCalls =
      this.modelId === 'moonshot.kimi-k2-thinking' && functionTools.length > 0;
    const generateId = this.config.generateId;
    const completedToolCalls: Array<{
      toolCallId: string;
      toolName: string;
      input: string;
    }> = [];

    const contentBlocks: Record<
      number,
      | {
          type: 'tool-call';
          toolCallId: string;
          toolName: string;
          jsonText: string;
          isJsonResponseTool?: boolean;
        }
      | {
          type: 'text';
          text?: string;
          isKimiToolCallCandidate?: boolean;
          textStarted?: boolean;
          hasStreamedNonWhitespace?: boolean;
        }
      | {
          type: 'reasoning';
          text?: string;
          isKimiToolCallCandidate?: boolean;
          reasoningStarted?: boolean;
          hasStreamedNonWhitespace?: boolean;
        }
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

            function enqueueTextDelta({
              contentBlock,
              blockId,
              delta,
            }: {
              contentBlock: Extract<
                (typeof contentBlocks)[number],
                { type: 'text' }
              >;
              blockId: string;
              delta: string;
            }) {
              if (delta === '') {
                return;
              }

              if (!contentBlock.textStarted) {
                controller.enqueue({
                  type: 'text-start',
                  id: blockId,
                });
                contentBlock.textStarted = true;
              }

              controller.enqueue({
                type: 'text-delta',
                id: blockId,
                delta,
              });
              contentBlock.hasStreamedNonWhitespace ||= delta.trim() !== '';
            }

            function endText({
              contentBlock,
              blockId,
            }: {
              contentBlock: Extract<
                (typeof contentBlocks)[number],
                { type: 'text' }
              >;
              blockId: string;
            }) {
              if (!contentBlock.textStarted) {
                return;
              }

              controller.enqueue({
                type: 'text-end',
                id: blockId,
              });
              contentBlock.textStarted = false;
            }

            function enqueueReasoningDelta({
              contentBlock,
              blockId,
              delta,
            }: {
              contentBlock: Extract<
                (typeof contentBlocks)[number],
                { type: 'reasoning' }
              >;
              blockId: string;
              delta: string;
            }) {
              if (delta === '') {
                return;
              }

              if (!contentBlock.reasoningStarted) {
                controller.enqueue({
                  type: 'reasoning-start',
                  id: blockId,
                });
                contentBlock.reasoningStarted = true;
              }

              controller.enqueue({
                type: 'reasoning-delta',
                id: blockId,
                delta,
              });
              contentBlock.hasStreamedNonWhitespace ||= delta.trim() !== '';
            }

            function endReasoning({
              contentBlock,
              blockId,
            }: {
              contentBlock: Extract<
                (typeof contentBlocks)[number],
                { type: 'reasoning' }
              >;
              blockId: string;
            }) {
              if (!contentBlock.reasoningStarted) {
                return;
              }

              controller.enqueue({
                type: 'reasoning-end',
                id: blockId,
              });
              contentBlock.reasoningStarted = false;
            }

            function enqueueRecoveredToolCalls(
              toolCalls: Array<{
                toolCallId: string;
                toolName: string;
                input: string;
              }>,
            ) {
              for (const toolCall of toolCalls) {
                controller.enqueue({
                  type: 'tool-input-start',
                  id: toolCall.toolCallId,
                  toolName: toolCall.toolName,
                });
                controller.enqueue({
                  type: 'tool-input-delta',
                  id: toolCall.toolCallId,
                  delta: toolCall.input,
                });
                controller.enqueue({
                  type: 'tool-input-end',
                  id: toolCall.toolCallId,
                });
                controller.enqueue({
                  type: 'tool-call',
                  toolCallId: toolCall.toolCallId,
                  toolName: toolCall.toolName,
                  input: toolCall.input,
                });
                completedToolCalls.push(toolCall);
              }

              hasParsedKimiK2ToolCall ||= toolCalls.length > 0;
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
              finishReason = hasParsedKimiK2ToolCall
                ? 'tool-calls'
                : mapBedrockFinishReason(
                    value.messageStop.stopReason as BedrockStopReason,
                    isJsonResponseFromTool,
                  );
              stopSequence =
                value.messageStop.additionalModelResponseFields?.delta
                  ?.stop_sequence ?? null;
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
              contentBlocks[blockIndex] = {
                type: 'text',
                ...(shouldParseKimiK2ToolCalls && {
                  text: '',
                  isKimiToolCallCandidate: false,
                  textStarted: false,
                  hasStreamedNonWhitespace: false,
                }),
              };

              if (!shouldParseKimiK2ToolCalls) {
                controller.enqueue({
                  type: 'text-start',
                  id: String(blockIndex),
                });
              }
            }

            if (
              value.contentBlockDelta?.delta &&
              'text' in value.contentBlockDelta.delta &&
              value.contentBlockDelta.delta.text
            ) {
              const blockIndex = value.contentBlockDelta.contentBlockIndex || 0;

              if (contentBlocks[blockIndex] == null) {
                contentBlocks[blockIndex] = {
                  type: 'text',
                  ...(shouldParseKimiK2ToolCalls && {
                    text: '',
                    isKimiToolCallCandidate: false,
                    textStarted: false,
                    hasStreamedNonWhitespace: false,
                  }),
                };

                if (!shouldParseKimiK2ToolCalls) {
                  controller.enqueue({
                    type: 'text-start',
                    id: String(blockIndex),
                  });
                }
              }

              const contentBlock = contentBlocks[blockIndex];
              if (contentBlock.type === 'text' && contentBlock.text != null) {
                const result = processKimiK2TextDelta({
                  pendingText: contentBlock.text,
                  delta: value.contentBlockDelta.delta.text,
                  isToolCallCandidate:
                    contentBlock.isKimiToolCallCandidate ?? false,
                  hasStreamedNonWhitespace:
                    contentBlock.hasStreamedNonWhitespace ?? false,
                });

                contentBlock.text = result.pendingText;
                contentBlock.isKimiToolCallCandidate =
                  result.isToolCallCandidate;
                enqueueTextDelta({
                  contentBlock,
                  blockId: String(blockIndex),
                  delta: result.streamableText,
                });
              } else {
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
                  if (contentBlock.text == null) {
                    endReasoning({
                      contentBlock,
                      blockId: String(blockIndex),
                    });
                  } else {
                    const parsedToolCallText =
                      contentBlock.isKimiToolCallCandidate
                        ? parseKimiK2ToolCallText({
                            text: contentBlock.text,
                            tools: functionTools,
                            generateId,
                          })
                        : undefined;

                    if (parsedToolCallText != null) {
                      const newToolCalls = parsedToolCallText.toolCalls.filter(
                        parsedToolCall =>
                          !completedToolCalls.some(completedToolCall =>
                            isSameKimiK2ToolCall(
                              completedToolCall,
                              parsedToolCall,
                            ),
                          ),
                      );

                      const recoveredReasoningText = [
                        parsedToolCallText.reasoningText,
                        parsedToolCallText.text,
                      ]
                        .filter(
                          (text): text is string =>
                            text != null && text.trim() !== '',
                        )
                        .join('');

                      enqueueReasoningDelta({
                        contentBlock,
                        blockId: String(blockIndex),
                        delta: recoveredReasoningText,
                      });
                      endReasoning({
                        contentBlock,
                        blockId: String(blockIndex),
                      });
                      enqueueRecoveredToolCalls(newToolCalls);
                    } else {
                      enqueueReasoningDelta({
                        contentBlock,
                        blockId: String(blockIndex),
                        delta: contentBlock.text,
                      });
                      endReasoning({
                        contentBlock,
                        blockId: String(blockIndex),
                      });
                    }
                  }
                } else if (contentBlock.type === 'text') {
                  if (contentBlock.text == null) {
                    controller.enqueue({
                      type: 'text-end',
                      id: String(blockIndex),
                    });
                  } else {
                    const parsedToolCallText =
                      contentBlock.isKimiToolCallCandidate
                        ? parseKimiK2ToolCallText({
                            text: contentBlock.text,
                            tools: functionTools,
                            generateId,
                          })
                        : undefined;

                    if (parsedToolCallText != null) {
                      const newToolCalls = parsedToolCallText.toolCalls.filter(
                        parsedToolCall =>
                          !completedToolCalls.some(completedToolCall =>
                            isSameKimiK2ToolCall(
                              completedToolCall,
                              parsedToolCall,
                            ),
                          ),
                      );

                      endText({
                        contentBlock,
                        blockId: String(blockIndex),
                      });

                      if (parsedToolCallText.reasoningText != null) {
                        const reasoningId = `${blockIndex}:reasoning`;
                        controller.enqueue({
                          type: 'reasoning-start',
                          id: reasoningId,
                        });
                        controller.enqueue({
                          type: 'reasoning-delta',
                          id: reasoningId,
                          delta: parsedToolCallText.reasoningText,
                        });
                        controller.enqueue({
                          type: 'reasoning-end',
                          id: reasoningId,
                        });
                      }

                      if (parsedToolCallText.text.trim() !== '') {
                        const recoveredTextId = `${blockIndex}:recovered`;
                        enqueueTextDelta({
                          contentBlock,
                          blockId: recoveredTextId,
                          delta: parsedToolCallText.text,
                        });
                        endText({
                          contentBlock,
                          blockId: recoveredTextId,
                        });
                      }

                      enqueueRecoveredToolCalls(newToolCalls);
                    } else if (
                      !isDuplicateKimiK2ToolCallText({
                        text: contentBlock.text,
                        toolCalls: completedToolCalls,
                      })
                    ) {
                      enqueueTextDelta({
                        contentBlock,
                        blockId: String(blockIndex),
                        delta: contentBlock.text,
                      });
                      endText({
                        contentBlock,
                        blockId: String(blockIndex),
                      });
                    } else {
                      endText({
                        contentBlock,
                        blockId: String(blockIndex),
                      });
                    }
                  }
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
                    completedToolCalls.push({
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
                  contentBlocks[blockIndex] = {
                    type: 'reasoning',
                    ...(shouldParseKimiK2ToolCalls && {
                      text: '',
                      isKimiToolCallCandidate: false,
                      reasoningStarted: false,
                      hasStreamedNonWhitespace: false,
                    }),
                  };
                }

                const contentBlock = contentBlocks[blockIndex];
                if (
                  contentBlock.type === 'reasoning' &&
                  contentBlock.text != null
                ) {
                  const result = processKimiK2TextDelta({
                    pendingText: contentBlock.text,
                    delta: reasoningContent.text,
                    isToolCallCandidate:
                      contentBlock.isKimiToolCallCandidate ?? false,
                    hasStreamedNonWhitespace:
                      contentBlock.hasStreamedNonWhitespace ?? false,
                  });

                  contentBlock.text = result.pendingText;
                  contentBlock.isKimiToolCallCandidate =
                    result.isToolCallCandidate;
                  enqueueReasoningDelta({
                    contentBlock,
                    blockId: String(blockIndex),
                    delta: result.streamableText,
                  });
                } else if (contentBlock.type === 'reasoning') {
                  enqueueReasoningDelta({
                    contentBlock,
                    blockId: String(blockIndex),
                    delta: reasoningContent.text,
                  });
                }
              } else if (
                'signature' in reasoningContent &&
                reasoningContent.signature
              ) {
                if (contentBlocks[blockIndex] == null) {
                  contentBlocks[blockIndex] = { type: 'reasoning' };
                }
                const contentBlock = contentBlocks[blockIndex];
                if (
                  contentBlock.type === 'reasoning' &&
                  !contentBlock.reasoningStarted
                ) {
                  controller.enqueue({
                    type: 'reasoning-start',
                    id: String(blockIndex),
                  });
                  contentBlock.reasoningStarted = true;
                }
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
                if (contentBlocks[blockIndex] == null) {
                  contentBlocks[blockIndex] = { type: 'reasoning' };
                }
                const contentBlock = contentBlocks[blockIndex];
                if (
                  contentBlock.type === 'reasoning' &&
                  !contentBlock.reasoningStarted
                ) {
                  controller.enqueue({
                    type: 'reasoning-start',
                    id: String(blockIndex),
                  });
                  contentBlock.reasoningStarted = true;
                }
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
            if (hasParsedKimiK2ToolCall) {
              finishReason = 'tool-calls';
            }

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

const BedrockAdditionalModelResponseFieldsSchema = z
  .object({
    delta: z
      .object({
        stop_sequence: z.string().nullish(),
      })
      .nullish(),
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

export {
  type BedrockReasoningMetadata,
  bedrockReasoningMetadataSchema,
} from './bedrock-reasoning-metadata';
