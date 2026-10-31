import type {
  APICallError,
  JSONObject,
  LanguageModelV4,
  LanguageModelV4CallOptions,
  LanguageModelV4Content,
  LanguageModelV4FinishReason,
  LanguageModelV4GenerateResult,
  LanguageModelV4StreamPart,
  LanguageModelV4StreamResult,
  SharedV4ProviderMetadata,
  SharedV4Warning,
} from '@ai-sdk/provider';
import {
  type Resolvable,
  resolve,
  combineHeaders,
  createEventSourceResponseHandler,
  createJsonErrorResponseHandler,
  createJsonResponseHandler,
  createLanguageModelResponseMetadata,
  createProviderStreamError,
  isCustomReasoning,
  mapReasoningToProviderEffort,
  parseProviderOptions,
  postJsonToApi,
  serializeModelOptions,
  WORKFLOW_SERIALIZE,
  WORKFLOW_DESERIALIZE,
  type FetchFunction,
  type InferSchema,
  type ParseResult,
  type ResponseHandler,
} from '@ai-sdk/provider-utils';
import { deepSeekErrorSchema } from '../chat/deepseek-chat-api-types';
import { convertToDeepSeekResponsesInput } from './convert-to-deepseek-responses-input';
import {
  convertDeepSeekResponsesUsage,
  getDeepSeekServerToolUse,
} from './convert-deepseek-responses-usage';
import {
  deepseekResponsesChunkSchema,
  deepseekResponsesResponseSchema,
  type DeepSeekResponsesOutputItem,
  type DeepSeekResponsesUsage,
} from './deepseek-responses-api';
import {
  deepseekLanguageModelResponsesOptions,
  type DeepSeekResponsesModelId,
} from './deepseek-responses-language-model-options';
import { prepareDeepSeekResponsesTools } from './deepseek-responses-prepare-tools';
import { mapDeepSeekResponsesFinishReason } from './map-deepseek-responses-finish-reason';

export type DeepSeekResponsesConfig = {
  provider: string;
  headers?: Resolvable<Record<string, string | undefined>>;
  url: (options: { modelId: string; path: string }) => string;
  fetch?: FetchFunction;
};

export class DeepSeekResponsesLanguageModel implements LanguageModelV4 {
  readonly specificationVersion = 'v4';

  readonly modelId: DeepSeekResponsesModelId;

  readonly supportedUrls = {
    'image/*': [/^https?:\/\/.*$/],
  };

  private readonly config: DeepSeekResponsesConfig;
  private readonly failedResponseHandler: ResponseHandler<APICallError>;

  static [WORKFLOW_SERIALIZE](model: DeepSeekResponsesLanguageModel) {
    return serializeModelOptions({
      modelId: model.modelId,
      config: model.config,
    });
  }

  static [WORKFLOW_DESERIALIZE](options: {
    modelId: DeepSeekResponsesModelId;
    config: DeepSeekResponsesConfig;
  }) {
    return new DeepSeekResponsesLanguageModel(options.modelId, options.config);
  }

  constructor(
    modelId: DeepSeekResponsesModelId,
    config: DeepSeekResponsesConfig,
  ) {
    this.modelId = modelId;
    this.config = config;
    this.failedResponseHandler = createJsonErrorResponseHandler({
      errorSchema: deepSeekErrorSchema,
      errorToMessage: (error: InferSchema<typeof deepSeekErrorSchema>) =>
        error.error.message,
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
    stopSequences,
    seed,
    responseFormat,
    providerOptions,
    tools,
    toolChoice,
    reasoning,
  }: LanguageModelV4CallOptions) {
    const warnings: SharedV4Warning[] = [];

    const deepseekOptions =
      (await parseProviderOptions({
        provider: this.providerOptionsName,
        providerOptions,
        schema: deepseekLanguageModelResponsesOptions,
      })) ?? {};

    if (topK != null) {
      warnings.push({ type: 'unsupported', feature: 'topK' });
    }
    if (seed != null) {
      warnings.push({ type: 'unsupported', feature: 'seed' });
    }
    if (frequencyPenalty != null) {
      warnings.push({ type: 'unsupported', feature: 'frequencyPenalty' });
    }
    if (presencePenalty != null) {
      warnings.push({ type: 'unsupported', feature: 'presencePenalty' });
    }
    if (stopSequences != null && stopSequences.length > 0) {
      warnings.push({ type: 'unsupported', feature: 'stopSequences' });
    }

    const { input, inputWarnings } = await convertToDeepSeekResponsesInput({
      prompt,
      providerOptionsName: this.providerOptionsName,
    });
    warnings.push(...inputWarnings);

    const {
      tools: deepseekTools,
      toolChoice: deepseekToolChoice,
      toolWarnings,
    } = prepareDeepSeekResponsesTools({ tools, toolChoice });
    warnings.push(...toolWarnings);

    const webSearchToolName = tools?.find(
      tool => tool.type === 'provider' && tool.id === 'deepseek.web_search',
    )?.name;

    const effort =
      deepseekOptions.thinking?.type === 'disabled'
        ? 'none'
        : (deepseekOptions.reasoningEffort ??
          (isCustomReasoning(reasoning)
            ? reasoning === 'none'
              ? 'none'
              : mapReasoningToProviderEffort({
                  reasoning,
                  effortMap: {
                    minimal: 'low',
                    low: 'low',
                    medium: 'high',
                    high: 'high',
                    xhigh: 'max',
                    max: 'max',
                  },
                  warnings,
                })
            : undefined));

    return {
      args: {
        model: this.modelId,
        input,
        max_output_tokens: maxOutputTokens,
        temperature,
        top_p: topP,
        ...(deepseekOptions.topLogprobs != null && {
          top_logprobs: deepseekOptions.topLogprobs,
        }),
        ...(effort != null && { reasoning: { effort } }),
        ...(responseFormat?.type === 'json' && {
          text: {
            format:
              responseFormat.schema != null
                ? {
                    type: 'json_schema',
                    name: responseFormat.name ?? 'response',
                    schema: responseFormat.schema,
                  }
                : { type: 'json_object' },
          },
        }),
        tools: deepseekTools,
        tool_choice: deepseekToolChoice,
        ...(deepseekOptions.userId != null && { user: deepseekOptions.userId }),
      },
      warnings,
      webSearchToolName,
    };
  }

  async doGenerate(
    options: LanguageModelV4CallOptions,
  ): Promise<LanguageModelV4GenerateResult> {
    const { args, warnings, webSearchToolName } = await this.getArgs(options);
    const providerOptionsName = this.providerOptionsName;

    const {
      responseHeaders,
      value: response,
      rawValue: rawResponse,
    } = await postJsonToApi({
      url: this.config.url({ path: '/responses', modelId: this.modelId }),
      headers: combineHeaders(
        await resolve(this.config.headers),
        options.headers,
      ),
      body: args,
      failedResponseHandler: this.failedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(
        deepseekResponsesResponseSchema,
      ),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch,
    });

    const content: Array<LanguageModelV4Content> = [];
    const logprobs: unknown[] = [];
    let hasFunctionCall = false;

    for (const item of response.output ?? []) {
      switch (item.type) {
        case 'reasoning': {
          const reasoning = item as ReasoningItem;
          const text = joinText(reasoning.content);
          content.push({
            type: 'reasoning',
            text,
            ...(reasoning.id != null && {
              providerMetadata: {
                [providerOptionsName]: { itemId: reasoning.id },
              },
            }),
          });
          break;
        }

        case 'message': {
          const message = item as MessageItem;
          for (const part of message.content ?? []) {
            if (part.logprobs != null) {
              logprobs.push(...part.logprobs);
            }
            if (part.text != null && part.text.length > 0) {
              content.push({ type: 'text', text: part.text });
            }
          }
          break;
        }

        case 'function_call': {
          const call = item as FunctionCallItem;
          hasFunctionCall = true;
          content.push({
            type: 'tool-call',
            toolCallId: call.call_id,
            toolName: call.name,
            input: call.arguments ?? '',
          });
          break;
        }

        case 'web_search_call': {
          content.push(
            ...webSearchCallContent({
              item: item as WebSearchCallItem,
              toolName: webSearchToolName ?? 'web_search',
              providerOptionsName,
            }),
          );
          break;
        }
      }
    }

    return {
      content,
      finishReason: {
        unified: mapDeepSeekResponsesFinishReason({
          status: response.status,
          incompleteReason: response.incomplete_details?.reason,
          hasFunctionCall,
        }),
        raw:
          response.incomplete_details?.reason ?? response.status ?? undefined,
      },
      usage: convertDeepSeekResponsesUsage(response.usage),
      providerMetadata: buildProviderMetadata({
        providerOptionsName,
        responseId: response.id,
        usage: response.usage,
        logprobs,
      }),
      request: { body: args },
      response: {
        ...createLanguageModelResponseMetadata({
          id: response.id,
          model: response.model,
          created: response.created_at,
        }),
        headers: responseHeaders,
        body: rawResponse,
      },
      warnings,
    };
  }

  async doStream(
    options: LanguageModelV4CallOptions,
  ): Promise<LanguageModelV4StreamResult> {
    const { args, warnings, webSearchToolName } = await this.getArgs(options);
    const providerOptionsName = this.providerOptionsName;
    const body = { ...args, stream: true };

    const { responseHeaders, value: response } = await postJsonToApi({
      url: this.config.url({ path: '/responses', modelId: this.modelId }),
      headers: combineHeaders(
        await resolve(this.config.headers),
        options.headers,
      ),
      body,
      failedResponseHandler: this.failedResponseHandler,
      successfulResponseHandler: createEventSourceResponseHandler(
        deepseekResponsesChunkSchema,
      ),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch,
    });

    let finishReason: LanguageModelV4FinishReason = {
      unified: 'interrupted',
      raw: undefined,
    };
    let usage: DeepSeekResponsesUsage | null | undefined;
    let responseId: string | null | undefined;
    let hasFunctionCall = false;
    const logprobs: unknown[] = [];
    const openText = new Set<string>();
    const openReasoning = new Set<string>();
    const functionCalls = new Map<
      string,
      { callId: string; toolName: string; arguments: string }
    >();

    return {
      stream: response.pipeThrough(
        new TransformStream<
          ParseResult<InferSchema<typeof deepseekResponsesChunkSchema>>,
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
              finishReason = { unified: 'error', raw: undefined };
              controller.enqueue({ type: 'error', error: chunk.error });
              return;
            }

            const value = chunk.value as StreamChunk;

            switch (value.type) {
              case 'response.created': {
                const created = value as ResponseChunk;
                responseId = created.response.id;
                controller.enqueue({
                  type: 'response-metadata',
                  ...createLanguageModelResponseMetadata({
                    id: created.response.id,
                    model: created.response.model,
                    created: created.response.created_at,
                  }),
                });
                return;
              }

              case 'response.output_item.added': {
                const item = (value as OutputItemChunk).item;
                const itemId = getItemId(item);
                if (item.type === 'message' && itemId != null) {
                  openText.add(itemId);
                  controller.enqueue({ type: 'text-start', id: itemId });
                } else if (item.type === 'reasoning' && itemId != null) {
                  openReasoning.add(itemId);
                  controller.enqueue({
                    type: 'reasoning-start',
                    id: itemId,
                    providerMetadata: {
                      [providerOptionsName]: { itemId },
                    },
                  });
                } else if (item.type === 'function_call') {
                  const call = item as FunctionCallItem;
                  functionCalls.set(call.id ?? call.call_id, {
                    callId: call.call_id,
                    toolName: call.name,
                    arguments: call.arguments ?? '',
                  });
                  controller.enqueue({
                    type: 'tool-input-start',
                    id: call.call_id,
                    toolName: call.name,
                  });
                }
                return;
              }

              case 'response.output_text.delta': {
                const delta = value as TextDeltaChunk;
                if (delta.logprobs != null) {
                  logprobs.push(...delta.logprobs);
                }
                if (!openText.has(delta.item_id)) {
                  openText.add(delta.item_id);
                  controller.enqueue({ type: 'text-start', id: delta.item_id });
                }
                controller.enqueue({
                  type: 'text-delta',
                  id: delta.item_id,
                  delta: delta.delta,
                });
                return;
              }

              case 'response.reasoning_text.delta': {
                const delta = value as TextDeltaChunk;
                if (!openReasoning.has(delta.item_id)) {
                  openReasoning.add(delta.item_id);
                  controller.enqueue({
                    type: 'reasoning-start',
                    id: delta.item_id,
                    providerMetadata: {
                      [providerOptionsName]: { itemId: delta.item_id },
                    },
                  });
                }
                controller.enqueue({
                  type: 'reasoning-delta',
                  id: delta.item_id,
                  delta: delta.delta,
                });
                return;
              }

              case 'response.function_call_arguments.delta': {
                const delta = value as TextDeltaChunk;
                const call = functionCalls.get(delta.item_id);
                if (call == null) {
                  return;
                }
                call.arguments += delta.delta;
                controller.enqueue({
                  type: 'tool-input-delta',
                  id: call.callId,
                  delta: delta.delta,
                });
                return;
              }

              case 'response.output_item.done': {
                const item = (value as OutputItemChunk).item;
                const itemId = getItemId(item);
                if (item.type === 'message' && itemId != null) {
                  if (openText.delete(itemId)) {
                    controller.enqueue({ type: 'text-end', id: itemId });
                  }
                } else if (item.type === 'reasoning' && itemId != null) {
                  if (openReasoning.delete(itemId)) {
                    controller.enqueue({
                      type: 'reasoning-end',
                      id: itemId,
                      providerMetadata: {
                        [providerOptionsName]: { itemId },
                      },
                    });
                  }
                } else if (item.type === 'function_call') {
                  const call = item as FunctionCallItem;
                  const key = call.id ?? call.call_id;
                  const tracked = functionCalls.get(key);
                  functionCalls.delete(key);
                  hasFunctionCall = true;
                  if (tracked == null) {
                    controller.enqueue({
                      type: 'tool-input-start',
                      id: call.call_id,
                      toolName: call.name,
                    });
                  }
                  controller.enqueue({
                    type: 'tool-input-end',
                    id: call.call_id,
                  });
                  controller.enqueue({
                    type: 'tool-call',
                    toolCallId: call.call_id,
                    toolName: call.name,
                    input: call.arguments ?? tracked?.arguments ?? '',
                  });
                } else if (item.type === 'web_search_call') {
                  for (const part of webSearchCallContent({
                    item: item as WebSearchCallItem,
                    toolName: webSearchToolName ?? 'web_search',
                    providerOptionsName,
                  })) {
                    controller.enqueue(part);
                  }
                }
                return;
              }

              case 'response.completed':
              case 'response.incomplete':
              case 'response.failed': {
                const done = value as ResponseChunk;
                usage = done.response.usage;
                responseId = done.response.id ?? responseId;
                finishReason = {
                  unified: mapDeepSeekResponsesFinishReason({
                    status: done.response.status,
                    incompleteReason: done.response.incomplete_details?.reason,
                    hasFunctionCall,
                  }),
                  raw:
                    done.response.incomplete_details?.reason ??
                    done.response.status ??
                    undefined,
                };
                if (value.type === 'response.failed') {
                  controller.enqueue({
                    type: 'error',
                    error: createProviderStreamError({
                      message:
                        done.response.error?.message ??
                        'DeepSeek response failed',
                      type: 'response.failed',
                      code: done.response.error?.code ?? undefined,
                      data: value,
                    }),
                  });
                }
                return;
              }

              case 'error': {
                const error = value as ErrorChunk;
                finishReason = { unified: 'error', raw: undefined };
                controller.enqueue({
                  type: 'error',
                  error: createProviderStreamError({
                    message: error.message ?? 'DeepSeek stream error',
                    type: 'error',
                    code: error.code ?? undefined,
                    data: value,
                  }),
                });
              }
            }
          },

          flush(controller) {
            for (const id of openReasoning) {
              controller.enqueue({ type: 'reasoning-end', id });
            }
            for (const id of openText) {
              controller.enqueue({ type: 'text-end', id });
            }

            controller.enqueue({
              type: 'finish',
              finishReason,
              usage: convertDeepSeekResponsesUsage(usage),
              providerMetadata: buildProviderMetadata({
                providerOptionsName,
                responseId,
                usage,
                logprobs,
              }),
            });
          },
        }),
      ),
      request: { body },
      response: { headers: responseHeaders },
    };
  }
}

type StreamChunk = InferSchema<typeof deepseekResponsesChunkSchema>;

type ResponseChunk = Extract<StreamChunk, { response: unknown }>;

type OutputItemChunk = Extract<StreamChunk, { item: unknown }>;

type TextDeltaChunk = Extract<
  StreamChunk,
  { type: 'response.output_text.delta' }
>;

type ErrorChunk = Extract<StreamChunk, { type: 'error' }>;

type MessageItem = Extract<DeepSeekResponsesOutputItem, { type: 'message' }>;

type ReasoningItem = Extract<
  DeepSeekResponsesOutputItem,
  { type: 'reasoning' }
>;

type FunctionCallItem = Extract<
  DeepSeekResponsesOutputItem,
  { type: 'function_call' }
>;

type WebSearchCallItem = Extract<
  DeepSeekResponsesOutputItem,
  { type: 'web_search_call' }
>;

function getItemId(item: DeepSeekResponsesOutputItem): string | undefined {
  return 'id' in item && typeof item.id === 'string' ? item.id : undefined;
}

function joinText(
  parts: Array<{ text?: string | null }> | null | undefined,
): string {
  return (parts ?? []).map(part => part.text ?? '').join('');
}

function webSearchCallContent({
  item,
  toolName,
  providerOptionsName,
}: {
  item: WebSearchCallItem;
  toolName: string;
  providerOptionsName: string;
}): Array<
  Extract<LanguageModelV4Content, { type: 'tool-call' | 'tool-result' }>
> {
  return [
    {
      type: 'tool-call',
      toolCallId: item.id,
      toolName,
      input: '{}',
      providerExecuted: true,
      providerMetadata: {
        [providerOptionsName]: { webSearchCall: item as JSONObject },
      },
    },
    {
      type: 'tool-result',
      toolCallId: item.id,
      toolName,
      result: {
        ...(item.status != null && { status: item.status }),
        ...(item.action != null && { action: item.action as JSONObject }),
      },
    },
  ];
}

function buildProviderMetadata({
  providerOptionsName,
  responseId,
  usage,
  logprobs,
}: {
  providerOptionsName: string;
  responseId: string | null | undefined;
  usage: DeepSeekResponsesUsage | null | undefined;
  logprobs: unknown[];
}): SharedV4ProviderMetadata {
  const serverToolUse = getDeepSeekServerToolUse(usage);
  return {
    [providerOptionsName]: {
      ...(responseId != null && { responseId }),
      ...(serverToolUse != null && { serverToolUse }),
      ...(logprobs.length > 0 && { logprobs: logprobs as JSONObject[] }),
    },
  };
}
