import { OpenAICompatibleChatLanguageModel } from '@ai-sdk/openai-compatible';
import type {
  LanguageModelV2,
  LanguageModelV2CallOptions,
  LanguageModelV2CallWarning,
  LanguageModelV2FinishReason,
  LanguageModelV2StreamPart,
} from '@ai-sdk/provider';
import {
  parseProviderOptions,
  type FetchFunction,
} from '@ai-sdk/provider-utils';
import type { ZaiChatModelId } from './zai-chat-options';
import { zaiLanguageModelChatOptions } from './zai-chat-language-model-options';
import { zaiErrorStructure } from './zai-error';

export type ZaiChatConfig = {
  provider: string;
  baseURL: string;
  headers?:
    | Record<string, string | undefined>
    | (() => Record<string, string | undefined>);
  fetch?: FetchFunction;
};

function transformZaiRequestBody(
  args: Record<string, any>,
): Record<string, any> {
  const {
    doSample,
    frequency_penalty: _frequencyPenalty,
    presence_penalty: _presencePenalty,
    requestId,
    seed: _seed,
    thinking,
    toolStream,
    user: _user,
    userId,
    verbosity: _verbosity,
    ...restArgs
  } = args;

  return {
    ...restArgs,
    ...(doSample !== undefined && { do_sample: doSample }),
    ...(thinking !== undefined && {
      thinking: {
        ...(thinking.type !== undefined && { type: thinking.type }),
        ...(thinking.clearThinking !== undefined && {
          clear_thinking: thinking.clearThinking,
        }),
      },
    }),
    ...(toolStream !== undefined && { tool_stream: toolStream }),
    ...(requestId !== undefined && { request_id: requestId }),
    ...(userId !== undefined && { user_id: userId }),
  };
}

function mapZaiFinishReason(
  finishReason: LanguageModelV2FinishReason,
  rawFinishReason: string | undefined,
): LanguageModelV2FinishReason {
  switch (rawFinishReason) {
    case 'sensitive':
      return 'content-filter';
    case 'model_context_window_exceeded':
      return 'length';
    case 'network_error':
      return 'error';
    default:
      return finishReason;
  }
}

function getRawFinishReason(responseBody: unknown): string | undefined {
  if (responseBody == null || typeof responseBody !== 'object') {
    return undefined;
  }

  const choices = (responseBody as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) {
    return undefined;
  }

  const choice = choices[0];
  if (choice == null || typeof choice !== 'object') {
    return undefined;
  }

  const finishReason = (choice as { finish_reason?: unknown }).finish_reason;
  return typeof finishReason === 'string' ? finishReason : undefined;
}

export class ZaiChatLanguageModel
  extends OpenAICompatibleChatLanguageModel
  implements LanguageModelV2
{
  constructor(modelId: ZaiChatModelId, config: ZaiChatConfig) {
    const headers = config.headers;

    super(modelId, {
      provider: config.provider,
      url: ({ path }) => `${config.baseURL}${path}`,
      headers: () =>
        headers == null
          ? {}
          : typeof headers === 'function'
            ? headers()
            : headers,
      fetch: config.fetch,
      errorStructure: zaiErrorStructure,
      transformRequestBody: transformZaiRequestBody,
      supportedUrls: () => ({
        'image/*': [/^https?:\/\//],
        'video/*': [/^https?:\/\//],
      }),
    });
  }

  private async prepareCallOptions(options: LanguageModelV2CallOptions) {
    const warnings: LanguageModelV2CallWarning[] = [];

    const zaiOptions = await parseProviderOptions({
      provider: 'zai',
      providerOptions: options.providerOptions,
      schema: zaiLanguageModelChatOptions,
    });

    if (options.frequencyPenalty != null) {
      warnings.push({
        type: 'unsupported-setting',
        setting: 'frequencyPenalty',
      });
    }
    if (options.presencePenalty != null) {
      warnings.push({
        type: 'unsupported-setting',
        setting: 'presencePenalty',
      });
    }
    if (options.seed != null) {
      warnings.push({ type: 'unsupported-setting', setting: 'seed' });
    }

    let tools = options.tools;
    let toolChoice = options.toolChoice;

    if (toolChoice?.type === 'none') {
      tools = undefined;
      toolChoice = undefined;
    } else if (toolChoice != null && toolChoice.type !== 'auto') {
      warnings.push({
        type: 'unsupported-setting',
        setting: 'toolChoice',
        details: 'Z.AI currently supports only automatic tool selection.',
      });
      toolChoice = undefined;
    }

    const normalizedOptions: LanguageModelV2CallOptions = {
      ...options,
      frequencyPenalty: undefined,
      presencePenalty: undefined,
      seed: undefined,
      tools,
      toolChoice,
      providerOptions:
        zaiOptions == null
          ? options.providerOptions
          : {
              ...options.providerOptions,
              zai: zaiOptions,
            },
    };

    return { normalizedOptions, warnings };
  }

  async doGenerate(
    options: Parameters<LanguageModelV2['doGenerate']>[0],
  ): Promise<Awaited<ReturnType<LanguageModelV2['doGenerate']>>> {
    const { normalizedOptions, warnings } =
      await this.prepareCallOptions(options);
    const result = await super.doGenerate(normalizedOptions);

    return {
      ...result,
      finishReason: mapZaiFinishReason(
        result.finishReason,
        getRawFinishReason(result.response?.body),
      ),
      warnings: [...result.warnings, ...warnings],
    };
  }

  async doStream(
    options: Parameters<LanguageModelV2['doStream']>[0],
  ): Promise<Awaited<ReturnType<LanguageModelV2['doStream']>>> {
    const originalIncludeRawChunks = options.includeRawChunks;
    const { normalizedOptions, warnings } =
      await this.prepareCallOptions(options);
    const result = await super.doStream({
      ...normalizedOptions,
      includeRawChunks: true,
    });

    let rawFinishReason: string | undefined;

    return {
      ...result,
      stream: result.stream.pipeThrough(
        new TransformStream<
          LanguageModelV2StreamPart,
          LanguageModelV2StreamPart
        >({
          transform(part, controller) {
            if (part.type === 'stream-start') {
              controller.enqueue({
                ...part,
                warnings: [...part.warnings, ...warnings],
              });
              return;
            }

            if (part.type === 'raw') {
              rawFinishReason =
                getRawFinishReason(part.rawValue) ?? rawFinishReason;
              if (originalIncludeRawChunks) {
                controller.enqueue(part);
              }
              return;
            }

            if (part.type === 'finish') {
              controller.enqueue({
                ...part,
                finishReason: mapZaiFinishReason(
                  part.finishReason,
                  rawFinishReason,
                ),
              });
              return;
            }

            controller.enqueue(part);
          },
        }),
      ),
    };
  }
}
