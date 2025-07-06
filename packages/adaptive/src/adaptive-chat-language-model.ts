import {
  LanguageModelV2,
  LanguageModelV2CallWarning,
  LanguageModelV2Content,
  LanguageModelV2FinishReason,
  LanguageModelV2Usage,
} from '@ai-sdk/provider';
import {
  combineHeaders,
  createEventSourceResponseHandler,
  createJsonResponseHandler,
  FetchFunction,
  postJsonToApi,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';
import {
  AdaptiveChatCompletionRequest,
  AdaptiveChatCompletionMessage,
} from './adaptive-types';
import { convertToAdaptiveChatMessages } from './convert-to-adaptive-chat-messages';
import { mapAdaptiveFinishReason } from './map-adaptive-finish-reason';
import { adaptiveProviderOptions } from './adaptive-chat-options';
import { getResponseMetadata } from './get-response-metadata';
import { adaptiveFailedResponseHandler } from './adaptive-error';

type AdaptiveChatConfig = {
  provider: string;
  baseURL: string;
  headers: () => Record<string, string | undefined>;
  fetch?: FetchFunction;
  defaultProvider?: string;
};

const adaptiveChatResponseSchema = z.object({
  id: z.string(),
  choices: z.array(
    z.object({
      message: z
        .object({
          content: z.string().optional(),
          role: z.string().optional(),
          toolCalls: z.array(z.any()).optional(),
        })
        .optional(),
      finishReason: z.string().optional(),
      index: z.number(),
    }),
  ),
  created: z.number(),
  model: z.string(),
  object: z.string(),
  usage: z
    .object({
      completion_tokens: z.number(),
      prompt_tokens: z.number(),
      total_tokens: z.number(),
    })
    .optional(),
  systemFingerprint: z.string().optional(),
  provider: z.string(),
});

const adaptiveChatChunkSchema = z.object({
  id: z.string(),
  choices: z.array(
    z.object({
      delta: z.object({
        content: z.string().optional(),
        role: z.string().optional(),
        toolCalls: z.array(z.any()).optional(),
      }),
      finishReason: z.string().optional(),
      index: z.number(),
    }),
  ),
  created: z.number(),
  model: z.string(),
  object: z.string(),
  usage: z
    .object({
      completion_tokens: z.number(),
      prompt_tokens: z.number(),
      total_tokens: z.number(),
    })
    .optional(),
  provider: z.string(),
});

export class AdaptiveChatLanguageModel implements LanguageModelV2 {
  readonly specificationVersion = 'v2';
  readonly modelId: string;
  private readonly config: AdaptiveChatConfig;

  constructor(modelId: string, config: AdaptiveChatConfig) {
    this.modelId = modelId;
    this.config = config;
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
    stopSequences,
    responseFormat,
    seed,
    providerOptions,
    tools,
    toolChoice,
  }: Parameters<LanguageModelV2['doGenerate']>[0]) {
    const warnings: LanguageModelV2CallWarning[] = [];

    // Warn for unsupported settings
    if (topK != null) {
      warnings.push({ type: 'unsupported-setting', setting: 'topK' });
    }
    if (responseFormat != null) {
      warnings.push({ type: 'unsupported-setting', setting: 'responseFormat' });
    }
    if (tools != null) {
      warnings.push({ type: 'unsupported-setting', setting: 'tools' });
    }
    if (toolChoice != null) {
      warnings.push({ type: 'unsupported-setting', setting: 'toolChoice' });
    }
    if (seed != null) {
      warnings.push({ type: 'unsupported-setting', setting: 'seed' });
    }
    // Parse provider options with zod schema (flat, not nested)
    const result = adaptiveProviderOptions.safeParse(providerOptions ?? {});
    const adaptiveOptions = result.success ? result.data : {};

    // Convert messages
    const { messages, warnings: messageWarnings } =
      convertToAdaptiveChatMessages({ prompt });
    warnings.push(...messageWarnings);

    // Parse model ID to extract provider and model
    const dashIndex = this.modelId.indexOf('-');
    if (dashIndex === -1) {
      throw new Error(
        `Invalid model ID format. Expected "providername-modelname", got "${this.modelId}"`,
      );
    }
    const provider = this.modelId.substring(0, dashIndex);
    const model = this.modelId.substring(dashIndex + 1);

    // Standardized settings
    const standardizedArgs = {
      model,
      provider,
      messages: messages as AdaptiveChatCompletionMessage[],
      max_tokens:
        typeof maxOutputTokens === 'number' ? maxOutputTokens : undefined,
      temperature,
      top_p: topP,
      stop: stopSequences,
      presence_penalty: presencePenalty,
      frequency_penalty: frequencyPenalty,
      user: adaptiveOptions.user,
      comparison_provider: adaptiveOptions.comparisonProvider,
    };

    // logit_bias
    const logitBias = adaptiveOptions.logitBias;

    const args: AdaptiveChatCompletionRequest = {
      ...standardizedArgs,
      ...(logitBias ? { logit_bias: logitBias } : {}),
    };

    return {
      args,
      warnings,
    };
  }

  async doGenerate(
    options: Parameters<LanguageModelV2['doGenerate']>[0],
  ): Promise<Awaited<ReturnType<LanguageModelV2['doGenerate']>>> {
    const { args: body, warnings } = await this.getArgs(options);

    const { responseHeaders, value, rawValue } = await postJsonToApi({
      url: `${this.config.baseURL}/chat/completions`,
      headers: combineHeaders(this.config.headers(), options.headers),
      body,
      failedResponseHandler: adaptiveFailedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(
        adaptiveChatResponseSchema,
      ),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch,
    });

    if (!value) {
      throw new Error('Failed to parse Adaptive API response');
    }

    const choice = value?.choices[0];
    const content: Array<LanguageModelV2Content> = [];

    if (choice.message?.content) {
      content.push({ type: 'text', text: choice.message.content });
    }

    if (choice.message?.toolCalls && choice.message.toolCalls.length > 0) {
      for (const toolCall of choice.message.toolCalls) {
        content.push({
          type: 'tool-call',
          toolCallId: toolCall.id || '',
          toolName: toolCall.function?.name || '',
          input: toolCall.function?.arguments || '{}',
        });
      }
    }

    // Extract usage information
    const { prompt_tokens, completion_tokens, total_tokens } =
      value.usage ?? {};

    return {
      content,
      finishReason: choice.finishReason
        ? mapAdaptiveFinishReason(choice.finishReason)
        : 'stop',
      usage: value.usage
        ? {
            inputTokens: prompt_tokens,
            outputTokens: completion_tokens,
            totalTokens: total_tokens,
          }
        : { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
      providerMetadata: value.provider
        ? {
            adaptive: {
              provider: value.provider,
            },
          }
        : undefined,
      request: { body },
      response: {
        id: value.id,
        modelId: value.model,
        timestamp: new Date(value.created * 1000),
        headers: responseHeaders,
        body: rawValue,
      },
      warnings,
    };
  }

  async doStream(
    options: Parameters<LanguageModelV2['doStream']>[0],
  ): Promise<Awaited<ReturnType<LanguageModelV2['doStream']>>> {
    const { args, warnings } = await this.getArgs(options);
    const body = {
      ...args,
      stream: true,
      stream_options: { include_usage: true },
    };

    const { responseHeaders, value: response } = await postJsonToApi({
      url: `${this.config.baseURL}/chat/completions`,
      headers: combineHeaders(this.config.headers(), options.headers),
      body,
      failedResponseHandler: adaptiveFailedResponseHandler,
      successfulResponseHandler: createEventSourceResponseHandler(
        adaptiveChatChunkSchema,
      ),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch,
    });

    const state = {
      finishReason: 'unknown' as LanguageModelV2FinishReason,
      usage: {
        inputTokens: undefined as number | undefined,
        outputTokens: undefined as number | undefined,
        totalTokens: undefined as number | undefined,
      } as LanguageModelV2Usage,
      isFirstChunk: true,
      isActiveText: false,
      provider: undefined as string | undefined,
    };

    return {
      stream: response.pipeThrough(
        new TransformStream({
          start(controller) {
            controller.enqueue({ type: 'stream-start', warnings });
          },
          async transform(chunk, controller) {
            if (options.includeRawChunks) {
              controller.enqueue({ type: 'raw', rawValue: chunk.rawValue });
            }

            // handle failed chunk parsing / validation:
            if (!chunk.success) {
              state.finishReason = 'error';
              controller.enqueue({ type: 'error', error: chunk.error });
              return;
            }

            const value = chunk.value;

            if (state.isFirstChunk) {
              state.isFirstChunk = false;
              controller.enqueue({
                type: 'response-metadata',
                ...getResponseMetadata({
                  id: value.id,
                  model: value.model,
                  created: value.created,
                }),
              });
            }

            if (value.usage != null) {
              state.usage.inputTokens = value.usage.prompt_tokens ?? undefined;
              state.usage.outputTokens =
                value.usage.completion_tokens ?? undefined;
              state.usage.totalTokens = value.usage.total_tokens ?? undefined;
            }

            if (value.provider) {
              state.provider = value.provider;
            }

            const choice = value.choices[0];
            if (choice?.finishReason != null) {
              state.finishReason = mapAdaptiveFinishReason(choice.finishReason);
            }

            if (!choice?.delta) {
              return;
            }

            const delta = choice.delta;

            if (delta.content != null) {
              if (!state.isActiveText) {
                controller.enqueue({ type: 'text-start', id: '0' });
                state.isActiveText = true;
              }
              controller.enqueue({
                type: 'text-delta',
                id: '0',
                delta: delta.content,
              });
            }

            if (delta.toolCalls != null && Array.isArray(delta.toolCalls)) {
              for (const toolCall of delta.toolCalls) {
                if (toolCall.type !== 'function') continue;
                controller.enqueue({
                  type: 'tool-call',
                  toolCallId: toolCall.id || '',
                  toolName: toolCall.function?.name || '',
                  input: toolCall.function?.arguments || '{}',
                });
              }
            }
          },
          flush(controller) {
            controller.enqueue({
              type: 'finish',
              finishReason: state.finishReason ?? 'stop',
              usage: state.usage ?? {
                inputTokens: 0,
                outputTokens: 0,
                totalTokens: 0,
              },
              providerMetadata: state.provider
                ? {
                    adaptive: {
                      provider: state.provider,
                    },
                  }
                : undefined,
            });
          },
        }),
      ),
      request: { body },
      response: {
        headers: responseHeaders,
      },
    };
  }
}
