import type {
  LanguageModelV4,
  LanguageModelV4CallOptions,
  LanguageModelV4Content,
  LanguageModelV4FinishReason,
  LanguageModelV4GenerateResult,
  LanguageModelV4StreamPart,
  LanguageModelV4StreamResult,
  SharedV4Warning,
} from '@ai-sdk/provider';
import {
  combineHeaders,
  createEventSourceResponseHandler,
  createJsonResponseHandler,
  createToolNameMapping,
  generateId,
  injectJsonInstructionIntoMessages,
  isCustomReasoning,
  mapReasoningToProviderEffort,
  parseProviderOptions,
  postJsonToApi,
  serializeModelOptions,
  WORKFLOW_DESERIALIZE,
  WORKFLOW_SERIALIZE,
  type FetchFunction,
  type ParseResult,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';
import {
  convertMistralUsage,
  type MistralUsage,
} from '../convert-mistral-usage';
import type { MistralChatModelId } from '../mistral-chat-language-model-options';
import { mistralFailedResponseHandler } from '../mistral-error';
import { convertToMistralConversationInput } from './convert-to-mistral-conversation-input';
import { mistralLanguageModelConversationsOptions } from './mistral-conversations-language-model-options';
import { prepareConversationTools } from './mistral-conversations-prepare-tools';

type MistralConversationsConfig = {
  provider: string;
  baseURL: string;
  headers?: () => Record<string, string | undefined>;
  fetch?: FetchFunction;
  generateId?: () => string;
};

const providerToolNames = {
  'mistral.web_search': 'web_search',
  'mistral.web_search_premium': 'web_search_premium',
} as const;

export class MistralConversationsLanguageModel implements LanguageModelV4 {
  readonly specificationVersion = 'v4';
  readonly modelId: MistralChatModelId;

  private readonly config: MistralConversationsConfig;
  private readonly generateId: () => string;

  static [WORKFLOW_SERIALIZE](model: MistralConversationsLanguageModel) {
    return serializeModelOptions({
      modelId: model.modelId,
      config: model.config,
    });
  }

  static [WORKFLOW_DESERIALIZE](options: {
    modelId: MistralChatModelId;
    config: MistralConversationsConfig;
  }) {
    return new MistralConversationsLanguageModel(
      options.modelId,
      options.config,
    );
  }

  constructor(modelId: MistralChatModelId, config: MistralConversationsConfig) {
    this.modelId = modelId;
    this.config = config;
    this.generateId = config.generateId ?? generateId;
  }

  get provider(): string {
    return this.config.provider;
  }

  readonly supportedUrls: Record<string, RegExp[]> = {
    'application/pdf': [/^https:\/\/.*$/],
  };

  private async getArgs({
    prompt,
    maxOutputTokens,
    temperature,
    topP,
    topK,
    frequencyPenalty,
    presencePenalty,
    reasoning,
    stopSequences,
    responseFormat,
    seed,
    providerOptions,
    tools,
    toolChoice,
  }: LanguageModelV4CallOptions) {
    const warnings: SharedV4Warning[] = [];

    const options =
      (await parseProviderOptions({
        provider: 'mistral',
        providerOptions,
        schema: mistralLanguageModelConversationsOptions,
      })) ?? {};

    if (topK != null) {
      warnings.push({ type: 'unsupported', feature: 'topK' });
    }

    let reasoningEffort: 'high' | 'none' | undefined;
    if (isCustomReasoning(reasoning)) {
      reasoningEffort =
        reasoning === 'none'
          ? 'none'
          : mapReasoningToProviderEffort({
              reasoning,
              effortMap: {
                minimal: 'high',
                low: 'high',
                medium: 'high',
                high: 'high',
                xhigh: 'high',
              },
              warnings,
            });
    }

    if (responseFormat?.type === 'json' && responseFormat.schema == null) {
      prompt = injectJsonInstructionIntoMessages({
        messages: prompt,
        schema: responseFormat.schema,
      });
    }

    const toolNameMapping = createToolNameMapping({
      tools,
      providerToolNames,
    });

    const {
      tools: mistralTools,
      toolChoice: mistralToolChoice,
      toolWarnings,
    } = prepareConversationTools({
      tools,
      toolChoice:
        toolChoice?.type === 'tool'
          ? {
              ...toolChoice,
              toolName: toolNameMapping.toProviderToolName(toolChoice.toolName),
            }
          : toolChoice,
    });

    const { inputs, instructions } = convertToMistralConversationInput({
      prompt,
      toolNameMapping,
    });

    const completionArgs = {
      max_tokens: maxOutputTokens,
      temperature,
      top_p: topP,
      ...(frequencyPenalty != null
        ? { frequency_penalty: frequencyPenalty }
        : {}),
      ...(presencePenalty != null ? { presence_penalty: presencePenalty } : {}),
      stop: stopSequences,
      random_seed: seed,
      reasoning_effort: reasoningEffort,
      response_format:
        responseFormat?.type === 'json'
          ? responseFormat.schema != null
            ? {
                type: 'json_schema',
                json_schema: {
                  schema: responseFormat.schema,
                  name: responseFormat.name ?? 'response',
                  description: responseFormat.description,
                },
              }
            : { type: 'json_object' }
          : undefined,
      tool_choice: mistralToolChoice,
    };

    return {
      args: {
        model: this.modelId,
        inputs,
        instructions,
        tools: mistralTools,
        completion_args: hasDefinedValue(completionArgs)
          ? completionArgs
          : undefined,
        store: options.store,
      },
      warnings: [...warnings, ...toolWarnings],
      toolNameMapping,
    };
  }

  async doGenerate(
    options: LanguageModelV4CallOptions,
  ): Promise<LanguageModelV4GenerateResult> {
    const {
      args: body,
      warnings,
      toolNameMapping,
    } = await this.getArgs(options);

    const {
      responseHeaders,
      value: response,
      rawValue: rawResponse,
    } = await postJsonToApi({
      url: `${this.config.baseURL}/conversations`,
      headers: combineHeaders(this.config.headers?.(), options.headers),
      body,
      failedResponseHandler: mistralFailedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(
        mistralConversationResponseSchema,
      ),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch,
    });

    const content: LanguageModelV4Content[] = [];
    let hasFunctionCall = false;

    for (const output of response.outputs) {
      switch (output.type) {
        case 'tool.execution': {
          const toolName = toolNameMapping.toCustomToolName(output.name);

          content.push({
            type: 'tool-call',
            toolCallId: output.id,
            toolName,
            input: output.arguments,
            providerExecuted: true,
          });
          content.push({
            type: 'tool-result',
            toolCallId: output.id,
            toolName,
            result: { info: output.info },
          });
          break;
        }

        case 'function.call':
          hasFunctionCall = true;
          content.push({
            type: 'tool-call',
            toolCallId: output.tool_call_id,
            toolName: output.name,
            input:
              typeof output.arguments === 'string'
                ? output.arguments
                : JSON.stringify(output.arguments),
          });
          break;

        case 'message.output':
          addMessageOutputContent({
            content,
            messageContent: output.content,
            generateId: this.generateId,
            entryId: output.id,
          });
          break;
      }
    }

    const firstOutput = response.outputs[0];

    return {
      content,
      finishReason: hasFunctionCall
        ? { unified: 'tool-calls', raw: 'tool_calls' }
        : { unified: 'stop', raw: 'stop' },
      usage: convertMistralUsage(response.usage),
      providerMetadata: {
        mistral: {
          conversationId: response.conversation_id,
        },
      },
      request: { body },
      response: {
        id: response.conversation_id,
        timestamp:
          firstOutput?.created_at != null
            ? new Date(firstOutput.created_at)
            : undefined,
        modelId: firstOutput?.model ?? this.modelId,
        headers: responseHeaders,
        body: rawResponse,
      },
      warnings,
    };
  }

  async doStream(
    options: LanguageModelV4CallOptions,
  ): Promise<LanguageModelV4StreamResult> {
    const { args, warnings, toolNameMapping } = await this.getArgs(options);
    const body = { ...args, stream: true };

    const { responseHeaders, value: response } = await postJsonToApi({
      url: `${this.config.baseURL}/conversations`,
      headers: combineHeaders(this.config.headers?.(), options.headers),
      body,
      failedResponseHandler: mistralFailedResponseHandler,
      successfulResponseHandler: createEventSourceResponseHandler(
        mistralConversationEventSchema,
      ),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch,
    });

    const generateId = this.generateId;
    const modelId = this.modelId;
    let conversationId: string | undefined;
    let finishEmitted = false;
    let activeTextId: string | undefined;
    let activeReasoningId: string | undefined;
    let finishReason: LanguageModelV4FinishReason = {
      unified: 'stop',
      raw: 'stop',
    };
    let usage: MistralUsage | undefined;
    const toolCalls = new Map<
      string,
      { toolName: string; input: string; providerExecuted: boolean }
    >();

    return {
      stream: response.pipeThrough(
        new TransformStream<
          ParseResult<z.infer<typeof mistralConversationEventSchema>>,
          LanguageModelV4StreamPart
        >({
          start(controller) {
            controller.enqueue({ type: 'stream-start', warnings });
          },

          transform(chunk, controller) {
            if (options.includeRawChunks) {
              controller.enqueue({ type: 'raw', rawValue: chunk.rawValue });
            }

            if (!chunk.success) {
              controller.enqueue({ type: 'error', error: chunk.error });
              return;
            }

            const event = chunk.value;

            switch (event.type) {
              case 'conversation.response.started':
                conversationId = event.conversation_id;
                controller.enqueue({
                  type: 'response-metadata',
                  id: event.conversation_id,
                  timestamp:
                    event.created_at != null
                      ? new Date(event.created_at)
                      : undefined,
                  modelId,
                });
                break;

              case 'tool.execution.started': {
                const toolName = toolNameMapping.toCustomToolName(event.name);
                toolCalls.set(event.id, {
                  toolName,
                  input: event.arguments,
                  providerExecuted: true,
                });
                controller.enqueue({
                  type: 'tool-input-start',
                  id: event.id,
                  toolName,
                  providerExecuted: true,
                });
                if (event.arguments.length > 0) {
                  controller.enqueue({
                    type: 'tool-input-delta',
                    id: event.id,
                    delta: event.arguments,
                  });
                }
                break;
              }

              case 'tool.execution.delta': {
                const toolCall = toolCalls.get(event.id);
                if (toolCall != null) {
                  toolCall.input += event.arguments;
                }
                controller.enqueue({
                  type: 'tool-input-delta',
                  id: event.id,
                  delta: event.arguments,
                });
                break;
              }

              case 'tool.execution.done': {
                const toolCall = toolCalls.get(event.id);
                const toolName =
                  toolCall?.toolName ??
                  toolNameMapping.toCustomToolName(event.name);
                const input = toolCall?.input ?? '{}';

                controller.enqueue({ type: 'tool-input-end', id: event.id });
                controller.enqueue({
                  type: 'tool-call',
                  toolCallId: event.id,
                  toolName,
                  input,
                  providerExecuted: true,
                });
                controller.enqueue({
                  type: 'tool-result',
                  toolCallId: event.id,
                  toolName,
                  result: { info: event.info },
                });
                toolCalls.delete(event.id);
                break;
              }

              case 'function.call.delta': {
                finishReason = { unified: 'tool-calls', raw: 'tool_calls' };
                let toolCall = toolCalls.get(event.tool_call_id);

                if (toolCall == null) {
                  toolCall = {
                    toolName: event.name,
                    input: '',
                    providerExecuted: false,
                  };
                  toolCalls.set(event.tool_call_id, toolCall);
                  controller.enqueue({
                    type: 'tool-input-start',
                    id: event.tool_call_id,
                    toolName: event.name,
                  });
                }

                const delta =
                  typeof event.arguments === 'string'
                    ? event.arguments
                    : JSON.stringify(event.arguments);
                toolCall.input += delta;
                controller.enqueue({
                  type: 'tool-input-delta',
                  id: event.tool_call_id,
                  delta,
                });
                break;
              }

              case 'message.output.delta': {
                const eventContent = event.content;

                if (typeof eventContent === 'string') {
                  activeTextId = emitTextDelta({
                    controller,
                    activeTextId,
                    textId: event.id,
                    delta: eventContent,
                  });
                } else {
                  switch (eventContent.type) {
                    case 'text':
                      activeTextId = emitTextDelta({
                        controller,
                        activeTextId,
                        textId: event.id,
                        delta: eventContent.text,
                      });
                      break;
                    case 'tool_reference':
                      if (eventContent.url != null) {
                        controller.enqueue({
                          type: 'source',
                          sourceType: 'url',
                          id: generateId(),
                          url: eventContent.url,
                          title: eventContent.title,
                          providerMetadata: {
                            mistral: {
                              tool: eventContent.tool,
                              favicon: eventContent.favicon,
                              description: eventContent.description,
                            },
                          },
                        });
                      }
                      break;
                    case 'thinking': {
                      const reasoningText = getThinkingText(eventContent);
                      if (reasoningText.length > 0) {
                        if (activeReasoningId == null) {
                          activeReasoningId = generateId();
                          controller.enqueue({
                            type: 'reasoning-start',
                            id: activeReasoningId,
                          });
                        }
                        controller.enqueue({
                          type: 'reasoning-delta',
                          id: activeReasoningId,
                          delta: reasoningText,
                        });
                      }
                      break;
                    }
                    case 'image_url':
                    case 'document_url':
                    case 'tool_file':
                      break;
                  }
                }
                break;
              }

              case 'conversation.response.error':
                controller.enqueue({
                  type: 'error',
                  error: new Error(event.message),
                });
                break;

              case 'conversation.response.done':
                usage = event.usage;
                closeActiveParts(controller);
                emitPendingFunctionCalls(controller);
                controller.enqueue({
                  type: 'finish',
                  finishReason,
                  usage: convertMistralUsage(usage),
                  providerMetadata:
                    conversationId != null
                      ? { mistral: { conversationId } }
                      : undefined,
                });
                finishEmitted = true;
                break;
            }
          },

          flush(controller) {
            if (finishEmitted) {
              return;
            }

            closeActiveParts(controller);
            emitPendingFunctionCalls(controller);
            controller.enqueue({
              type: 'finish',
              finishReason,
              usage: convertMistralUsage(usage),
              providerMetadata:
                conversationId != null
                  ? { mistral: { conversationId } }
                  : undefined,
            });
          },
        }),
      ),
      request: { body },
      response: { headers: responseHeaders },
    };

    function closeActiveParts(
      controller: TransformStreamDefaultController<LanguageModelV4StreamPart>,
    ) {
      if (activeTextId != null) {
        controller.enqueue({ type: 'text-end', id: activeTextId });
        activeTextId = undefined;
      }
      if (activeReasoningId != null) {
        controller.enqueue({
          type: 'reasoning-end',
          id: activeReasoningId,
        });
        activeReasoningId = undefined;
      }
    }

    function emitPendingFunctionCalls(
      controller: TransformStreamDefaultController<LanguageModelV4StreamPart>,
    ) {
      for (const [toolCallId, toolCall] of toolCalls) {
        if (toolCall.providerExecuted) {
          continue;
        }
        controller.enqueue({ type: 'tool-input-end', id: toolCallId });
        controller.enqueue({
          type: 'tool-call',
          toolCallId,
          toolName: toolCall.toolName,
          input: toolCall.input,
        });
      }
      toolCalls.clear();
    }
  }
}

function hasDefinedValue(record: Record<string, unknown>): boolean {
  return Object.values(record).some(value => value !== undefined);
}

function emitTextDelta({
  controller,
  activeTextId,
  textId,
  delta,
}: {
  controller: TransformStreamDefaultController<LanguageModelV4StreamPart>;
  activeTextId: string | undefined;
  textId: string;
  delta: string;
}): string {
  if (activeTextId == null) {
    controller.enqueue({ type: 'text-start', id: textId });
    activeTextId = textId;
  }
  controller.enqueue({ type: 'text-delta', id: activeTextId, delta });
  return activeTextId;
}

function addMessageOutputContent({
  content,
  messageContent,
  generateId,
  entryId,
}: {
  content: LanguageModelV4Content[];
  messageContent: z.infer<typeof mistralMessageOutputContentSchema>;
  generateId: () => string;
  entryId: string;
}) {
  if (typeof messageContent === 'string') {
    if (messageContent.length > 0) {
      content.push({
        type: 'text',
        text: messageContent,
        providerMetadata: { mistral: { entryId } },
      });
    }
    return;
  }

  for (const part of messageContent) {
    switch (part.type) {
      case 'text':
        if (part.text.length > 0) {
          content.push({
            type: 'text',
            text: part.text,
            providerMetadata: { mistral: { entryId } },
          });
        }
        break;
      case 'tool_reference':
        if (part.url != null) {
          content.push({
            type: 'source',
            sourceType: 'url',
            id: generateId(),
            url: part.url,
            title: part.title,
            providerMetadata: {
              mistral: {
                tool: part.tool,
                favicon: part.favicon,
                description: part.description,
              },
            },
          });
        }
        break;
      case 'thinking': {
        const reasoningText = getThinkingText(part);
        if (reasoningText.length > 0) {
          content.push({ type: 'reasoning', text: reasoningText });
        }
        break;
      }
      case 'image_url':
      case 'document_url':
      case 'tool_file':
        break;
    }
  }
}

function getThinkingText(
  part: Extract<
    z.infer<typeof mistralOutputContentPartSchema>,
    { type: 'thinking' }
  >,
) {
  return part.thinking
    .filter(
      (item): item is Extract<typeof item, { type: 'text' }> =>
        item.type === 'text',
    )
    .map(item => item.text)
    .join('');
}

const mistralJsonRecordSchema = z.record(z.string(), z.json());

const mistralToolReferenceSchema = z.object({
  type: z.literal('tool_reference'),
  tool: z.string(),
  title: z.string(),
  url: z.string().nullish(),
  favicon: z.string().nullish(),
  description: z.string().nullish(),
});

const mistralThinkingSchema = z.object({
  type: z.literal('thinking'),
  thinking: z.array(
    z.discriminatedUnion('type', [
      z.object({ type: z.literal('text'), text: z.string() }),
      mistralToolReferenceSchema,
      z.object({
        type: z.literal('reference'),
        reference_ids: z.array(z.union([z.string(), z.number()])),
      }),
    ]),
  ),
});

const mistralOutputContentPartSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('text'), text: z.string() }),
  mistralToolReferenceSchema,
  mistralThinkingSchema,
  z.object({
    type: z.literal('image_url'),
    image_url: z.union([z.string(), mistralJsonRecordSchema]),
  }),
  z.object({
    type: z.literal('document_url'),
    document_url: z.string(),
  }),
  z.object({
    type: z.literal('tool_file'),
    file_id: z.string().nullish(),
    file_name: z.string().nullish(),
  }),
]);

const mistralMessageOutputContentSchema = z.union([
  z.string(),
  z.array(mistralOutputContentPartSchema),
]);

const mistralConversationUsageSchema = z.object({
  prompt_tokens: z.number(),
  completion_tokens: z.number(),
  total_tokens: z.number(),
  connector_tokens: z.number().nullish(),
  connectors: z.record(z.string(), z.number()).nullish(),
});

const mistralConversationOutputSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('tool.execution'),
    id: z.string(),
    name: z.string(),
    arguments: z.string(),
    info: mistralJsonRecordSchema.optional(),
    created_at: z.string().nullish(),
    model: z.string().nullish(),
  }),
  z.object({
    type: z.literal('function.call'),
    id: z.string().nullish(),
    tool_call_id: z.string(),
    name: z.string(),
    arguments: z.union([z.string(), mistralJsonRecordSchema]),
    created_at: z.string().nullish(),
    model: z.string().nullish(),
  }),
  z.object({
    type: z.literal('message.output'),
    id: z.string(),
    content: mistralMessageOutputContentSchema,
    created_at: z.string().nullish(),
    model: z.string().nullish(),
  }),
]);

const mistralConversationResponseSchema = z.object({
  object: z.literal('conversation.response'),
  conversation_id: z.string(),
  outputs: z.array(mistralConversationOutputSchema),
  usage: mistralConversationUsageSchema,
});

const mistralConversationEventSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('conversation.response.started'),
    created_at: z.string().nullish(),
    conversation_id: z.string(),
  }),
  z.object({
    type: z.literal('tool.execution.started'),
    id: z.string(),
    name: z.string(),
    arguments: z.string(),
  }),
  z.object({
    type: z.literal('tool.execution.delta'),
    id: z.string(),
    name: z.string(),
    arguments: z.string(),
  }),
  z.object({
    type: z.literal('tool.execution.done'),
    id: z.string(),
    name: z.string(),
    info: mistralJsonRecordSchema.optional(),
  }),
  z.object({
    type: z.literal('function.call.delta'),
    id: z.string(),
    tool_call_id: z.string(),
    name: z.string(),
    arguments: z.union([z.string(), mistralJsonRecordSchema]),
  }),
  z.object({
    type: z.literal('message.output.delta'),
    id: z.string(),
    content: z.union([z.string(), mistralOutputContentPartSchema]),
  }),
  z.object({
    type: z.literal('conversation.response.error'),
    message: z.string(),
    code: z.number(),
  }),
  z.object({
    type: z.literal('conversation.response.done'),
    usage: mistralConversationUsageSchema,
  }),
]);
