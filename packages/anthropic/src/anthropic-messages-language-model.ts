import {
  LanguageModelV1,
  LanguageModelV1CallWarning,
  LanguageModelV1FinishReason,
  LanguageModelV1FunctionToolCall,
  LanguageModelV1ProviderMetadata,
  LanguageModelV1StreamPart,
  UnsupportedFunctionalityError,
} from '@ai-sdk/provider';
import {
  FetchFunction,
  ParseResult,
  Resolvable,
  combineHeaders,
  createEventSourceResponseHandler,
  createJsonResponseHandler,
  postJsonToApi,
  resolve,
} from '@ai-sdk/provider-utils';
import { z } from 'zod';
import { anthropicFailedResponseHandler } from './anthropic-error';
import {
  AnthropicMessagesModelId,
  AnthropicMessagesSettings,
} from './anthropic-messages-settings';
import { convertToAnthropicMessagesPrompt } from './convert-to-anthropic-messages-prompt';
import { mapAnthropicStopReason } from './map-anthropic-stop-reason';
import { prepareTools } from './anthropic-prepare-tools';

type AnthropicMessagesConfig = {
  provider: string;
  baseURL: string;
  headers: Resolvable<Record<string, string | undefined>>;
  fetch?: FetchFunction;
  buildRequestUrl?: (baseURL: string, isStreaming: boolean) => string;
  transformRequestBody?: (args: Record<string, any>) => Record<string, any>;
};

export class AnthropicMessagesLanguageModel implements LanguageModelV1 {
  readonly specificationVersion = 'v1';
  readonly defaultObjectGenerationMode = 'tool';
  readonly supportsImageUrls = false;

  readonly modelId: AnthropicMessagesModelId;
  readonly settings: AnthropicMessagesSettings;

  private readonly config: AnthropicMessagesConfig;

  constructor(
    modelId: AnthropicMessagesModelId,
    settings: AnthropicMessagesSettings,
    config: AnthropicMessagesConfig,
  ) {
    this.modelId = modelId;
    this.settings = settings;
    this.config = config;
  }

  get provider(): string {
    return this.config.provider;
  }

  private async getArgs({
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
  }: Parameters<LanguageModelV1['doGenerate']>[0]) {
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

    if (responseFormat != null && responseFormat.type !== 'text') {
      warnings.push({
        type: 'unsupported-setting',
        setting: 'responseFormat',
        details: 'JSON response format is not supported.',
      });
    }

    const { prompt: messagesPrompt, betas: messagesBetas } =
      convertToAnthropicMessagesPrompt({
        prompt,
        cacheControl: this.settings.cacheControl ?? false,
      });

    const baseArgs = {
      // model id:
      model: this.modelId,

      // standardized settings:
      max_tokens: maxTokens ?? 4096, // 4096: max model output tokens TODO remove
      temperature,
      top_k: topK,
      top_p: topP,
      stop_sequences: stopSequences,

      // prompt:
      system: messagesPrompt.system,
      messages: messagesPrompt.messages,
    };

    switch (type) {
      case 'regular': {
        const {
          tools,
          tool_choice,
          toolWarnings,
          betas: toolsBetas,
        } = prepareTools(mode);

        return {
          args: { ...baseArgs, tools, tool_choice },
          warnings: [...warnings, ...toolWarnings],
          betas: new Set([...messagesBetas, ...toolsBetas]),
        };
      }

      case 'object-json': {
        throw new UnsupportedFunctionalityError({
          functionality: 'json-mode object generation',
        });
      }

      case 'object-tool': {
        const { name, description, parameters } = mode.tool;

        return {
          args: {
            ...baseArgs,
            tools: [{ name, description, input_schema: parameters }],
            tool_choice: { type: 'tool', name },
          },
          warnings,
          betas: messagesBetas,
        };
      }

      default: {
        const _exhaustiveCheck: never = type;
        throw new Error(`Unsupported type: ${_exhaustiveCheck}`);
      }
    }
  }

  private async getHeaders({
    betas,
    headers,
  }: {
    betas: Set<string>;
    headers: Record<string, string | undefined> | undefined;
  }) {
    if (this.settings.cacheControl) {
      betas.add('prompt-caching-2024-07-31');
    }

    return combineHeaders(
      await resolve(this.config.headers),
      betas.size > 0 ? { 'anthropic-beta': Array.from(betas).join(',') } : {},
      headers,
    );
  }

  private buildRequestUrl(isStreaming: boolean): string {
    return (
      this.config.buildRequestUrl?.(this.config.baseURL, isStreaming) ??
      `${this.config.baseURL}/messages`
    );
  }

  private transformRequestBody(args: Record<string, any>): Record<string, any> {
    return this.config.transformRequestBody?.(args) ?? args;
  }

  async doGenerate(
    options: Parameters<LanguageModelV1['doGenerate']>[0],
  ): Promise<Awaited<ReturnType<LanguageModelV1['doGenerate']>>> {
    const { args, warnings, betas } = await this.getArgs(options);

    const { responseHeaders, value: response } = await postJsonToApi({
      url: this.buildRequestUrl(false),
      headers: await this.getHeaders({ betas, headers: options.headers }),
      body: this.transformRequestBody(args),
      failedResponseHandler: anthropicFailedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(
        anthropicMessagesResponseSchema,
      ),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch,
    });

    const { messages: rawPrompt, ...rawSettings } = args;

    // extract text
    let text = '';
    for (const content of response.content) {
      if (content.type === 'text') {
        text += content.text;
      }
    }

    // extract tool calls
    let toolCalls: LanguageModelV1FunctionToolCall[] | undefined = undefined;
    if (response.content.some(content => content.type === 'tool_use')) {
      toolCalls = [];
      for (const content of response.content) {
        if (content.type === 'tool_use') {
          toolCalls.push({
            toolCallType: 'function',
            toolCallId: content.id,
            toolName: content.name,
            args: JSON.stringify(content.input),
          });
        }
      }
    }

    return {
      text,
      toolCalls,
      finishReason: mapAnthropicStopReason(response.stop_reason),
      usage: {
        promptTokens: response.usage.input_tokens,
        completionTokens: response.usage.output_tokens,
      },
      rawCall: { rawPrompt, rawSettings },
      rawResponse: { headers: responseHeaders },
      response: {
        id: response.id ?? undefined,
        modelId: response.model ?? undefined,
      },
      warnings,
      providerMetadata:
        this.settings.cacheControl === true
          ? {
              anthropic: {
                cacheCreationInputTokens:
                  response.usage.cache_creation_input_tokens ?? null,
                cacheReadInputTokens:
                  response.usage.cache_read_input_tokens ?? null,
              },
            }
          : undefined,
      request: { body: JSON.stringify(args) },
    };
  }

  async doStream(
    options: Parameters<LanguageModelV1['doStream']>[0],
  ): Promise<Awaited<ReturnType<LanguageModelV1['doStream']>>> {
    const { args, warnings, betas } = await this.getArgs(options);
    const body = { ...args, stream: true };

    const { responseHeaders, value: response } = await postJsonToApi({
      url: this.buildRequestUrl(true),
      headers: await this.getHeaders({ betas, headers: options.headers }),
      body: this.transformRequestBody(body),
      failedResponseHandler: anthropicFailedResponseHandler,
      successfulResponseHandler: createEventSourceResponseHandler(
        anthropicMessagesChunkSchema,
      ),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch,
    });

    const { messages: rawPrompt, ...rawSettings } = args;

    let finishReason: LanguageModelV1FinishReason = 'unknown';
    const usage: { promptTokens: number; completionTokens: number } = {
      promptTokens: Number.NaN,
      completionTokens: Number.NaN,
    };

    const toolCallContentBlocks: Record<
      number,
      {
        toolCallId: string;
        toolName: string;
        jsonText: string;
      }
    > = {};

    let providerMetadata: LanguageModelV1ProviderMetadata | undefined =
      undefined;

    const self = this;
    return {
      stream: response.pipeThrough(
        new TransformStream<
          ParseResult<z.infer<typeof anthropicMessagesChunkSchema>>,
          LanguageModelV1StreamPart
        >({
          transform(chunk, controller) {
            if (!chunk.success) {
              controller.enqueue({ type: 'error', error: chunk.error });
              return;
            }

            const value = chunk.value;

            switch (value.type) {
              case 'ping': {
                return; // ignored
              }

              case 'content_block_start': {
                const contentBlockType = value.content_block.type;

                switch (contentBlockType) {
                  case 'text': {
                    return; // ignored
                  }

                  case 'tool_use': {
                    toolCallContentBlocks[value.index] = {
                      toolCallId: value.content_block.id,
                      toolName: value.content_block.name,
                      jsonText: '',
                    };
                    return;
                  }

                  default: {
                    const _exhaustiveCheck: never = contentBlockType;
                    throw new Error(
                      `Unsupported content block type: ${_exhaustiveCheck}`,
                    );
                  }
                }
              }

              case 'content_block_stop': {
                // when finishing a tool call block, send the full tool call:
                if (toolCallContentBlocks[value.index] != null) {
                  const contentBlock = toolCallContentBlocks[value.index];

                  controller.enqueue({
                    type: 'tool-call',
                    toolCallType: 'function',
                    toolCallId: contentBlock.toolCallId,
                    toolName: contentBlock.toolName,
                    args: contentBlock.jsonText,
                  });

                  delete toolCallContentBlocks[value.index];
                }

                return;
              }

              case 'content_block_delta': {
                const deltaType = value.delta.type;
                switch (deltaType) {
                  case 'text_delta': {
                    controller.enqueue({
                      type: 'text-delta',
                      textDelta: value.delta.text,
                    });

                    return;
                  }

                  case 'input_json_delta': {
                    const contentBlock = toolCallContentBlocks[value.index];

                    controller.enqueue({
                      type: 'tool-call-delta',
                      toolCallType: 'function',
                      toolCallId: contentBlock.toolCallId,
                      toolName: contentBlock.toolName,
                      argsTextDelta: value.delta.partial_json,
                    });

                    contentBlock.jsonText += value.delta.partial_json;

                    return;
                  }

                  default: {
                    const _exhaustiveCheck: never = deltaType;
                    throw new Error(
                      `Unsupported delta type: ${_exhaustiveCheck}`,
                    );
                  }
                }
              }

              case 'message_start': {
                usage.promptTokens = value.message.usage.input_tokens;
                usage.completionTokens = value.message.usage.output_tokens;

                if (self.settings.cacheControl === true) {
                  providerMetadata = {
                    anthropic: {
                      cacheCreationInputTokens:
                        value.message.usage.cache_creation_input_tokens ?? null,
                      cacheReadInputTokens:
                        value.message.usage.cache_read_input_tokens ?? null,
                    },
                  };
                }

                controller.enqueue({
                  type: 'response-metadata',
                  id: value.message.id ?? undefined,
                  modelId: value.message.model ?? undefined,
                });

                return;
              }

              case 'message_delta': {
                usage.completionTokens = value.usage.output_tokens;
                finishReason = mapAnthropicStopReason(value.delta.stop_reason);
                return;
              }

              case 'message_stop': {
                controller.enqueue({
                  type: 'finish',
                  finishReason,
                  usage,
                  providerMetadata,
                });
                return;
              }

              case 'error': {
                controller.enqueue({ type: 'error', error: value.error });
                return;
              }

              default: {
                const _exhaustiveCheck: never = value;
                throw new Error(`Unsupported chunk type: ${_exhaustiveCheck}`);
              }
            }
          },
        }),
      ),
      rawCall: { rawPrompt, rawSettings },
      rawResponse: { headers: responseHeaders },
      warnings,
      request: { body: JSON.stringify(body) },
    };
  }
}

// limited version of the schema, focussed on what is needed for the implementation
// this approach limits breakages when the API changes and increases efficiency
const anthropicMessagesResponseSchema = z.object({
  type: z.literal('message'),
  id: z.string().nullish(),
  model: z.string().nullish(),
  content: z.array(
    z.discriminatedUnion('type', [
      z.object({
        type: z.literal('text'),
        text: z.string(),
      }),
      z.object({
        type: z.literal('tool_use'),
        id: z.string(),
        name: z.string(),
        input: z.unknown(),
      }),
    ]),
  ),
  stop_reason: z.string().nullish(),
  usage: z.object({
    input_tokens: z.number(),
    output_tokens: z.number(),
    cache_creation_input_tokens: z.number().nullish(),
    cache_read_input_tokens: z.number().nullish(),
  }),
});

// limited version of the schema, focussed on what is needed for the implementation
// this approach limits breakages when the API changes and increases efficiency
const anthropicMessagesChunkSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('message_start'),
    message: z.object({
      id: z.string().nullish(),
      model: z.string().nullish(),
      usage: z.object({
        input_tokens: z.number(),
        output_tokens: z.number(),
        cache_creation_input_tokens: z.number().nullish(),
        cache_read_input_tokens: z.number().nullish(),
      }),
    }),
  }),
  z.object({
    type: z.literal('content_block_start'),
    index: z.number(),
    content_block: z.discriminatedUnion('type', [
      z.object({
        type: z.literal('text'),
        text: z.string(),
      }),
      z.object({
        type: z.literal('tool_use'),
        id: z.string(),
        name: z.string(),
      }),
    ]),
  }),
  z.object({
    type: z.literal('content_block_delta'),
    index: z.number(),
    delta: z.discriminatedUnion('type', [
      z.object({
        type: z.literal('input_json_delta'),
        partial_json: z.string(),
      }),
      z.object({
        type: z.literal('text_delta'),
        text: z.string(),
      }),
    ]),
  }),
  z.object({
    type: z.literal('content_block_stop'),
    index: z.number(),
  }),
  z.object({
    type: z.literal('error'),
    error: z.object({
      type: z.string(),
      message: z.string(),
    }),
  }),
  z.object({
    type: z.literal('message_delta'),
    delta: z.object({ stop_reason: z.string().nullish() }),
    usage: z.object({ output_tokens: z.number() }),
  }),
  z.object({
    type: z.literal('message_stop'),
  }),
  z.object({
    type: z.literal('ping'),
  }),
]);
