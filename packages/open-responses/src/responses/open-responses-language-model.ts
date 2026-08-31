import {
  APICallError,
  type LanguageModelV4,
  type LanguageModelV4CallOptions,
  type LanguageModelV4Content,
  type LanguageModelV4FinishReason,
  type LanguageModelV4GenerateResult,
  type LanguageModelV4StreamPart,
  type LanguageModelV4StreamResult,
  type LanguageModelV4Usage,
  type SharedV4ProviderMetadata,
  type SharedV4Warning,
} from '@ai-sdk/provider';
import {
  combineHeaders,
  createEventSourceResponseHandler,
  createJsonErrorResponseHandler,
  createJsonResponseHandler,
  createProviderStreamError,
  isCustomReasoning,
  jsonSchema,
  mapReasoningToProviderEffort,
  parseProviderOptions,
  postJsonToApi,
  SerializationError,
  serializeModelOptions,
  WORKFLOW_SERIALIZE,
  WORKFLOW_DESERIALIZE,
  type ParseResult,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';
import {
  createOpenResponsesExtensionRegistry,
  isOpenResponsesExtensionEvent,
  isOpenResponsesExtensionItem,
  isOpenResponsesJSONObject,
  type OpenResponsesExtension,
  type OpenResponsesExtensionContentPart,
  type OpenResponsesExtensionItem,
  type OpenResponsesExtensionRecord,
  type OpenResponsesExtensionRegistry,
} from '../open-responses-extension';
import { convertToOpenResponsesInput } from './convert-to-open-responses-input';
import {
  openResponsesErrorSchema,
  type Annotation,
  type OpenResponsesRequestBody,
  type OpenResponsesResponseBody,
  type OpenResponsesChunk,
  type ReasoningBody,
  type ToolChoiceParam,
} from './open-responses-api';
import { mapOpenResponsesFinishReason } from './map-open-responses-finish-reason';
import type { OpenResponsesConfig } from './open-responses-config';
import { openResponsesLanguageModelOptions } from './open-responses-language-model-options';

export class OpenResponsesLanguageModel implements LanguageModelV4 {
  readonly specificationVersion = 'v4';

  readonly modelId: string;

  private readonly config: OpenResponsesConfig;
  private readonly extensionRegistry: OpenResponsesExtensionRegistry;

  static [WORKFLOW_SERIALIZE](model: OpenResponsesLanguageModel) {
    if (model.extensionRegistry.byExtensionId.size > 0) {
      throw new SerializationError({
        message:
          'Open Responses models with registered extensions cannot be serialized across workflow boundaries. Recreate the provider with its extension codecs inside the workflow step.',
      });
    }

    return serializeModelOptions({
      modelId: model.modelId,
      config: model.config,
    });
  }

  static [WORKFLOW_DESERIALIZE](options: {
    modelId: string;
    config: OpenResponsesConfig;
  }) {
    return new OpenResponsesLanguageModel(options.modelId, options.config);
  }

  constructor(modelId: string, config: OpenResponsesConfig) {
    this.modelId = modelId;
    this.config = config;
    this.extensionRegistry =
      config.extensionRegistry ?? createOpenResponsesExtensionRegistry();
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
    reasoning,
    prompt,
    providerOptions,
    tools,
    toolChoice,
    responseFormat,
  }: LanguageModelV4CallOptions): Promise<{
    body: Omit<OpenResponsesRequestBody, 'stream' | 'stream_options'>;
    warnings: SharedV4Warning[];
  }> {
    const warnings: SharedV4Warning[] = [];

    if (stopSequences != null) {
      warnings.push({ type: 'unsupported', feature: 'stopSequences' });
    }

    if (topK != null) {
      warnings.push({ type: 'unsupported', feature: 'topK' });
    }

    if (seed != null) {
      warnings.push({ type: 'unsupported', feature: 'seed' });
    }

    const providerToolsByName = new Map(
      (tools ?? [])
        .filter(tool => tool.type === 'provider')
        .map(tool => [tool.name, tool]),
    );

    const {
      input,
      instructions,
      warnings: inputWarnings,
    } = await convertToOpenResponsesInput({
      prompt,
      providerOptionsName: this.config.providerOptionsName,
      extensionRegistry: this.extensionRegistry,
      providerToolsByName,
    });

    warnings.push(...inputWarnings);

    const convertedTools: NonNullable<OpenResponsesRequestBody['tools']> = [];
    const encodedProviderToolsByName = new Map<
      string,
      {
        toolType: OpenResponsesExtensionRecord['type'];
        encodeToolChoice: OpenResponsesExtension['encodeToolChoice'];
        tool: Extract<
          NonNullable<LanguageModelV4CallOptions['tools']>[number],
          { type: 'provider' }
        >;
      }
    >();

    for (const tool of tools ?? []) {
      if (tool.type === 'provider') {
        const extension = this.extensionRegistry.byProviderToolId.get(tool.id);
        let encoded: OpenResponsesExtensionRecord | undefined;

        if (extension != null) {
          try {
            const fields = await extension.encodeTool({
              name: tool.name,
              args: tool.args,
            });

            if (isOpenResponsesJSONObject(fields)) {
              encoded = {
                ...fields,
                type: extension.toolType,
              };
            }
          } catch {
            // Encoding failures are reported as unsupported below.
          }
        }

        if (encoded == null) {
          warnings.push({
            type: 'unsupported',
            feature: `provider-defined tool ${tool.id}`,
          });
        } else if (extension != null) {
          convertedTools.push(encoded);
          encodedProviderToolsByName.set(tool.name, {
            toolType: extension.toolType,
            encodeToolChoice: extension.encodeToolChoice,
            tool,
          });
        }
      } else {
        convertedTools.push({
          type: 'function',
          name: tool.name,
          description: tool.description,
          parameters: tool.inputSchema,
          ...(tool.strict != null ? { strict: tool.strict } : {}),
        });
      }
    }

    // Convert tool choice to the Open Responses format
    let convertedToolChoice: ToolChoiceParam | undefined;
    if (toolChoice?.type === 'tool') {
      const registeredTool = encodedProviderToolsByName.get(
        toolChoice.toolName,
      );

      if (registeredTool == null) {
        if (!providerToolsByName.has(toolChoice.toolName)) {
          convertedToolChoice = {
            type: 'function',
            name: toolChoice.toolName,
          };
        }
      } else {
        const { encodeToolChoice, tool, toolType } = registeredTool;
        let fields: unknown = {};

        try {
          fields = await encodeToolChoice?.({
            name: tool.name,
            args: tool.args,
          });
        } catch {
          fields = undefined;
        }

        if (encodeToolChoice != null && !isOpenResponsesJSONObject(fields)) {
          warnings.push({
            type: 'unsupported',
            feature: `tool choice for provider-defined tool ${tool.id}`,
          });
        } else {
          convertedToolChoice = {
            ...(isOpenResponsesJSONObject(fields) ? fields : {}),
            type: toolType,
          };
        }
      }
    } else {
      convertedToolChoice = toolChoice?.type;
    }

    const textFormat =
      responseFormat?.type === 'json'
        ? {
            type: 'json_schema' as const,
            ...(responseFormat.schema != null
              ? {
                  name: responseFormat.name ?? 'response',
                  description: responseFormat.description,
                  schema: responseFormat.schema,
                  strict: true,
                }
              : {}),
          }
        : undefined;

    const openResponsesOptions = await parseProviderOptions({
      provider: this.config.providerOptionsName,
      providerOptions,
      schema: openResponsesLanguageModelOptions,
    });

    const resolvedReasoningEffort =
      openResponsesOptions?.reasoningEffort ??
      (isCustomReasoning(reasoning)
        ? reasoning === 'none'
          ? 'none'
          : mapReasoningToProviderEffort({
              reasoning,
              effortMap: {
                minimal: 'low',
                low: 'low',
                medium: 'medium',
                high: 'high',
                xhigh: 'xhigh',
              },
              warnings,
            })
        : undefined);

    return {
      body: {
        model: this.modelId,
        input,
        instructions,
        max_output_tokens: maxOutputTokens,
        temperature,
        top_p: topP,
        presence_penalty: presencePenalty,
        frequency_penalty: frequencyPenalty,
        reasoning:
          resolvedReasoningEffort != null ||
          openResponsesOptions?.reasoningSummary != null
            ? {
                ...(resolvedReasoningEffort != null && {
                  effort: resolvedReasoningEffort,
                }),
                ...(openResponsesOptions?.reasoningSummary != null && {
                  summary: openResponsesOptions.reasoningSummary,
                }),
              }
            : undefined,
        tools: convertedTools.length ? convertedTools : undefined,
        tool_choice: convertedToolChoice,
        ...(textFormat != null && { text: { format: textFormat } }),
      },
      warnings,
    };
  }

  async doGenerate(
    options: LanguageModelV4CallOptions,
  ): Promise<LanguageModelV4GenerateResult> {
    const { body, warnings } = await this.getArgs(options);

    const {
      responseHeaders,
      value: response,
      rawValue: rawResponse,
    } = await postJsonToApi({
      url: this.config.url,
      headers: combineHeaders(this.config.headers?.(), options.headers),
      body,
      failedResponseHandler: createJsonErrorResponseHandler({
        errorSchema: openResponsesErrorSchema,
        errorToMessage: error => error.error.message,
      }),
      successfulResponseHandler: createJsonResponseHandler(
        // do not validate the response body, only apply types to the response body
        jsonSchema<OpenResponsesResponseBody>(() => {
          throw new Error('json schema not implemented');
        }),
      ),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch,
    });

    if (response.error) {
      throw new APICallError({
        message: response.error.message,
        url: this.config.url,
        requestBodyValues: body,
        statusCode: 400,
        responseHeaders,
        responseBody: rawResponse as string,
        isRetryable: false,
      });
    }

    if (response.output == null) {
      const detail = response.incomplete_details?.reason ?? response.status;
      throw new APICallError({
        message: detail
          ? `Responses API returned no output (${detail})`
          : 'Responses API returned no output',
        url: this.config.url,
        requestBodyValues: body,
        statusCode: 500,
        responseHeaders,
        responseBody: rawResponse as string,
        isRetryable: false,
      });
    }

    const content: Array<LanguageModelV4Content> = [];
    let hasToolCalls = false;

    for (const part of response.output) {
      switch (part.type) {
        // TODO AI SDK 7 adjust reasoning in the specification to better support the reasoning structure from open responses.
        case 'reasoning': {
          if ((part.content?.length ?? 0) > 0) {
            for (const contentPart of part.content!) {
              content.push({
                type: 'reasoning',
                text: contentPart.text,
                providerMetadata: createReasoningProviderMetadata({
                  part,
                  providerOptionsName: this.config.providerOptionsName,
                  reasoningContent: [contentPart],
                }),
              });
            }
          } else {
            content.push({
              type: 'reasoning',
              text: part.summary.map(summaryPart => summaryPart.text).join(''),
              providerMetadata: createReasoningProviderMetadata({
                part,
                providerOptionsName: this.config.providerOptionsName,
              }),
            });
          }
          break;
        }

        case 'message': {
          for (const contentPart of part.content) {
            const annotations = getOutputTextAnnotations(contentPart);

            content.push({
              type: 'text',
              text: contentPart.text,
              providerMetadata: {
                [this.config.providerOptionsName]: {
                  itemId: part.id,
                  ...(annotations.length > 0 && { annotations }),
                },
              },
            });
          }

          break;
        }

        case 'function_call': {
          hasToolCalls = true;
          content.push({
            type: 'tool-call',
            toolCallId: part.call_id,
            toolName: part.name,
            input: part.arguments,
            providerMetadata: {
              [this.config.providerOptionsName]: { itemId: part.id },
            },
          });
          break;
        }

        default: {
          if (!isOpenResponsesExtensionItem(part)) {
            break;
          }

          const decoded = await decodeExtensionItem({
            extensionRegistry: this.extensionRegistry,
            item: part,
            mode: 'generate',
            providerOptionsName: this.config.providerOptionsName,
          });

          if (decoded != null) {
            content.push(...decoded);
            hasToolCalls ||= decoded.some(part => part.type === 'tool-call');
          }
          break;
        }
      }
    }

    const usage = response.usage;
    const inputTokens = usage?.input_tokens;
    const cachedInputTokens = usage?.input_tokens_details?.cached_tokens;
    const outputTokens = usage?.output_tokens;
    const reasoningTokens = usage?.output_tokens_details?.reasoning_tokens;

    return {
      content,
      finishReason: {
        unified: mapOpenResponsesFinishReason({
          finishReason: response.incomplete_details?.reason,
          hasToolCalls,
        }),
        raw: response.incomplete_details?.reason ?? undefined,
      },
      usage: {
        inputTokens: {
          total: inputTokens,
          noCache: (inputTokens ?? 0) - (cachedInputTokens ?? 0),
          cacheRead: cachedInputTokens,
          cacheWrite: undefined,
        },
        outputTokens: {
          total: outputTokens,
          text: (outputTokens ?? 0) - (reasoningTokens ?? 0),
          reasoning: reasoningTokens,
        },
        raw: response.usage,
      },
      request: { body },
      response: {
        id: response.id,
        timestamp: new Date(response.created_at! * 1000),
        modelId: response.model,
        headers: responseHeaders,
        body: rawResponse,
      },
      providerMetadata: undefined,
      warnings,
    };
  }

  async doStream(
    options: LanguageModelV4CallOptions,
  ): Promise<LanguageModelV4StreamResult> {
    const { body, warnings } = await this.getArgs(options);

    const { responseHeaders, value: response } = await postJsonToApi({
      url: this.config.url,
      headers: combineHeaders(this.config.headers?.(), options.headers),
      body: {
        ...body,
        stream: true,
      } satisfies OpenResponsesRequestBody,
      failedResponseHandler: createJsonErrorResponseHandler({
        errorSchema: openResponsesErrorSchema,
        errorToMessage: error => error.error.message,
      }),
      successfulResponseHandler: createEventSourceResponseHandler(z.any()),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch,
    });

    const usage: LanguageModelV4Usage = {
      inputTokens: {
        total: undefined,
        noCache: undefined,
        cacheRead: undefined,
        cacheWrite: undefined,
      },
      outputTokens: {
        total: undefined,
        text: undefined,
        reasoning: undefined,
      },
    };

    const updateUsage = (
      responseUsage?: OpenResponsesResponseBody['usage'],
    ) => {
      if (!responseUsage) {
        return;
      }

      const inputTokens = responseUsage.input_tokens;
      const cachedInputTokens =
        responseUsage.input_tokens_details?.cached_tokens;
      const outputTokens = responseUsage.output_tokens;
      const reasoningTokens =
        responseUsage.output_tokens_details?.reasoning_tokens;

      usage.inputTokens = {
        total: inputTokens,
        noCache: (inputTokens ?? 0) - (cachedInputTokens ?? 0),
        cacheRead: cachedInputTokens,
        cacheWrite: undefined,
      };
      usage.outputTokens = {
        total: outputTokens,
        text: (outputTokens ?? 0) - (reasoningTokens ?? 0),
        reasoning: reasoningTokens,
      };
      usage.raw = responseUsage;
    };

    let activeReasoningId: string | undefined;
    let hasToolCalls = false;
    let finishReason: LanguageModelV4FinishReason = {
      unified: 'other',
      raw: undefined,
    };
    const toolCallsByItemId = new Map<
      string,
      { toolName?: string; toolCallId?: string; arguments?: string }
    >();
    const providerOptionsName = this.config.providerOptionsName;
    const extensionRegistry = this.extensionRegistry;
    const extensionStreamState = new Map<string, unknown>();

    return {
      stream: response.pipeThrough(
        new TransformStream<
          ParseResult<OpenResponsesChunk>,
          LanguageModelV4StreamPart
        >({
          start(controller) {
            controller.enqueue({ type: 'stream-start', warnings });
          },

          async transform(parseResult, controller) {
            if (options.includeRawChunks) {
              controller.enqueue({
                type: 'raw',
                rawValue: parseResult.rawValue,
              });
            }

            if (!parseResult.success) {
              controller.enqueue({ type: 'error', error: parseResult.error });
              return;
            }

            const chunk = parseResult.value;

            if (isOpenResponsesExtensionEvent(chunk)) {
              const extension = extensionRegistry.byEventType.get(chunk.type);
              if (extension?.decodeEvent != null) {
                try {
                  const decoded = await extension.decodeEvent({
                    event: chunk,
                    state: extensionStreamState,
                  });
                  for (const part of decoded ?? []) {
                    controller.enqueue(part);
                    hasToolCalls ||=
                      part.type === 'tool-call' ||
                      part.type === 'tool-input-start';
                  }
                } catch (error) {
                  controller.enqueue({ type: 'error', error });
                }
              }
              return;
            }

            // Tool call events (single-shot tool-call when complete)
            if (
              chunk.type === 'response.output_item.added' &&
              chunk.item.type === 'function_call'
            ) {
              toolCallsByItemId.set(chunk.item.id, {
                toolName: chunk.item.name,
                toolCallId: chunk.item.call_id,
                arguments: chunk.item.arguments,
              });
            } else if (
              chunk.type === 'response.function_call_arguments.delta'
            ) {
              const functionCallChunk = chunk;
              const toolCall = toolCallsByItemId.get(functionCallChunk.item_id);

              if (toolCall == null) {
                toolCallsByItemId.set(functionCallChunk.item_id, {
                  arguments: functionCallChunk.delta,
                });
                return;
              }

              toolCall.arguments =
                (toolCall.arguments ?? '') + functionCallChunk.delta;
            } else if (chunk.type === 'response.function_call_arguments.done') {
              const functionCallChunk = chunk;
              const toolCall = toolCallsByItemId.get(functionCallChunk.item_id);

              if (toolCall == null) {
                toolCallsByItemId.set(functionCallChunk.item_id, {
                  arguments: functionCallChunk.arguments,
                });
                return;
              }

              toolCall.arguments = functionCallChunk.arguments;
            } else if (
              chunk.type === 'response.output_item.done' &&
              chunk.item.type === 'function_call'
            ) {
              const toolCall = toolCallsByItemId.get(chunk.item.id);
              const toolName = toolCall?.toolName ?? chunk.item.name;
              const toolCallId = toolCall?.toolCallId ?? chunk.item.call_id;
              const input = toolCall?.arguments ?? chunk.item.arguments ?? '';

              controller.enqueue({
                type: 'tool-call',
                toolCallId,
                toolName,
                input,
                providerMetadata: {
                  [providerOptionsName]: {
                    itemId: chunk.item.id,
                  },
                },
              });
              hasToolCalls = true;

              toolCallsByItemId.delete(chunk.item.id);
            } else if (
              chunk.type === 'response.output_item.done' &&
              isOpenResponsesExtensionItem(chunk.item)
            ) {
              try {
                const decoded = await decodeExtensionItem({
                  extensionRegistry,
                  item: chunk.item,
                  mode: 'stream',
                  providerOptionsName,
                });

                for (const part of decoded ?? []) {
                  controller.enqueue(part);
                  hasToolCalls ||= part.type === 'tool-call';
                }
              } catch (error) {
                controller.enqueue({ type: 'error', error });
              }
            }

            // Reasoning events (note: response.reasoning_text.delta is an LM Studio extension, not in official spec)
            else if (
              chunk.type === 'response.output_item.added' &&
              chunk.item.type === 'reasoning'
            ) {
              controller.enqueue({
                type: 'reasoning-start',
                id: chunk.item.id,
              });
              activeReasoningId = chunk.item.id;
            } else if (
              chunk.type === 'response.reasoning_summary_text.delta' ||
              (chunk as { type: string }).type ===
                'response.reasoning_text.delta'
            ) {
              const reasoningChunk = chunk as {
                item_id: string;
                delta: string;
              };
              controller.enqueue({
                type: 'reasoning-delta',
                id: reasoningChunk.item_id,
                delta: reasoningChunk.delta,
              });
            } else if (
              chunk.type === 'response.output_item.done' &&
              chunk.item.type === 'reasoning'
            ) {
              controller.enqueue({
                type: 'reasoning-end',
                id: chunk.item.id,
                providerMetadata: createReasoningProviderMetadata({
                  part: chunk.item,
                  providerOptionsName,
                }),
              });
              if (activeReasoningId === chunk.item.id) {
                activeReasoningId = undefined;
              }
            }

            // Text events
            else if (
              chunk.type === 'response.output_item.added' &&
              chunk.item.type === 'message'
            ) {
              controller.enqueue({ type: 'text-start', id: chunk.item.id });
            } else if (chunk.type === 'response.output_text.delta') {
              controller.enqueue({
                type: 'text-delta',
                id: chunk.item_id,
                delta: chunk.delta,
              });
            } else if (
              chunk.type === 'response.output_item.done' &&
              chunk.item.type === 'message'
            ) {
              const annotations = chunk.item.content.flatMap(
                getOutputTextAnnotations,
              );

              controller.enqueue({
                type: 'text-end',
                id: chunk.item.id,
                providerMetadata: {
                  [providerOptionsName]: {
                    itemId: chunk.item.id,
                    ...(annotations.length > 0 && { annotations }),
                  },
                },
              });
            } else if (
              chunk.type === 'response.completed' ||
              chunk.type === 'response.incomplete'
            ) {
              const reason = chunk.response.incomplete_details?.reason;
              finishReason = {
                unified: mapOpenResponsesFinishReason({
                  finishReason: reason,
                  hasToolCalls,
                }),
                raw: reason ?? undefined,
              };
              updateUsage(chunk.response.usage);
            } else if (chunk.type === 'response.failed') {
              finishReason = {
                unified: 'error',
                raw: chunk.response.error?.code ?? chunk.response.status,
              };
              updateUsage(chunk.response.usage);
              if (chunk.response.error != null) {
                controller.enqueue({
                  type: 'error',
                  error: createOpenResponsesStreamError({
                    type: chunk.type,
                    error: chunk.response.error,
                    data: chunk,
                  }),
                });
              }
            } else if (chunk.type === 'error') {
              finishReason = {
                unified: 'error',
                raw: chunk.error.code,
              };
              controller.enqueue({
                type: 'error',
                error: createOpenResponsesStreamError({
                  type: chunk.type,
                  error: chunk.error,
                  data: chunk,
                }),
              });
            }
          },

          flush(controller) {
            if (activeReasoningId != null) {
              controller.enqueue({
                type: 'reasoning-end',
                id: activeReasoningId,
              });
            }

            controller.enqueue({
              type: 'finish',
              finishReason,
              usage,
              providerMetadata: undefined,
            });
          },
        }),
      ),
      request: { body },
      response: { headers: responseHeaders },
    };
  }
}

function createOpenResponsesStreamError({
  type,
  error,
  data,
}: {
  type: 'error' | 'response.failed';
  error: { message: string; code: string };
  data: unknown;
}) {
  return createProviderStreamError({
    message: error.message,
    type,
    code: error.code,
    data,
  });
}

function createReasoningProviderMetadata({
  part,
  providerOptionsName,
  reasoningContent = part.content,
}: {
  part: ReasoningBody;
  providerOptionsName: string;
  reasoningContent?: ReasoningBody['content'];
}): SharedV4ProviderMetadata {
  return {
    [providerOptionsName]: {
      itemId: part.id,
      reasoningSummary: part.summary.map(summaryPart => ({
        type: 'summary_text',
        text: summaryPart.text,
      })),
      reasoningContent:
        reasoningContent == null
          ? null
          : reasoningContent.map(contentPart => ({
              type: 'reasoning_text',
              text: contentPart.text,
            })),
      ...(part.encrypted_content != null && {
        reasoningEncryptedContent: part.encrypted_content,
      }),
    },
  };
}

async function decodeExtensionItem({
  extensionRegistry,
  item,
  mode,
  providerOptionsName,
}: {
  extensionRegistry: OpenResponsesExtensionRegistry;
  item: OpenResponsesExtensionItem;
  mode: 'generate' | 'stream';
  providerOptionsName: string;
}): Promise<OpenResponsesExtensionContentPart[] | undefined> {
  const extension = extensionRegistry.byItemType.get(item.type);
  if (extension == null) {
    return undefined;
  }

  const decoded = await extension.decodeItem({ item, mode });
  if (decoded == null) {
    return undefined;
  }

  return [
    createExtensionReplayCarrier({
      extension,
      item,
      providerOptionsName,
    }),
    ...decoded.map(part =>
      addExtensionItemReferenceMetadata({
        extension,
        item,
        part,
        providerOptionsName,
      }),
    ),
  ];
}

function createExtensionReplayCarrier({
  extension,
  item,
  providerOptionsName,
}: {
  extension: OpenResponsesExtension;
  item: OpenResponsesExtensionItem;
  providerOptionsName: string;
}): OpenResponsesExtensionContentPart {
  return {
    type: 'custom',
    kind: 'open-responses.extension-replay',
    providerMetadata: {
      [providerOptionsName]: {
        openResponsesExtension: {
          id: extension.id,
          item,
        },
      },
    },
  };
}

function addExtensionItemReferenceMetadata({
  extension,
  item,
  part,
  providerOptionsName,
}: {
  extension: OpenResponsesExtension;
  item: OpenResponsesExtensionItem;
  part: OpenResponsesExtensionContentPart;
  providerOptionsName: string;
}): OpenResponsesExtensionContentPart {
  const providerMetadata = part.providerMetadata ?? {};

  return {
    ...part,
    providerMetadata: {
      ...providerMetadata,
      [providerOptionsName]: {
        ...providerMetadata[providerOptionsName],
        openResponsesExtension: {
          id: extension.id,
          itemId: item.id,
        },
      },
    },
  };
}

function getOutputTextAnnotations(value: unknown): Annotation[] {
  if (
    value == null ||
    typeof value !== 'object' ||
    !('annotations' in value) ||
    !Array.isArray(value.annotations) ||
    !value.annotations.every(
      annotation =>
        annotation != null &&
        typeof annotation === 'object' &&
        (annotation as { type?: unknown }).type === 'url_citation' &&
        typeof (annotation as { start_index?: unknown }).start_index ===
          'number' &&
        typeof (annotation as { end_index?: unknown }).end_index === 'number' &&
        typeof (annotation as { url?: unknown }).url === 'string' &&
        typeof (annotation as { title?: unknown }).title === 'string',
    )
  ) {
    return [];
  }

  return value.annotations.map(annotation => ({
    type: 'url_citation',
    start_index: (annotation as { start_index: number }).start_index,
    end_index: (annotation as { end_index: number }).end_index,
    url: (annotation as { url: string }).url,
    title: (annotation as { title: string }).title,
  }));
}
