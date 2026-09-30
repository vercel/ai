import { OpenAICompatibleChatLanguageModel } from '@ai-sdk/openai-compatible';
import type {
  LanguageModelV3,
  LanguageModelV3CallOptions,
  LanguageModelV3FinishReason,
  LanguageModelV3GenerateResult,
  LanguageModelV3StreamPart,
  LanguageModelV3StreamResult,
  SharedV3Warning,
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
  finishReason: LanguageModelV3FinishReason,
): LanguageModelV3FinishReason {
  switch (finishReason.raw) {
    case 'sensitive':
      return { unified: 'content-filter', raw: finishReason.raw };
    case 'model_context_window_exceeded':
      return { unified: 'length', raw: finishReason.raw };
    case 'network_error':
      return { unified: 'error', raw: finishReason.raw };
    default:
      return finishReason;
  }
}

export class ZaiChatLanguageModel
  extends OpenAICompatibleChatLanguageModel
  implements LanguageModelV3
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

  private async prepareCallOptions(options: LanguageModelV3CallOptions) {
    const warnings: SharedV3Warning[] = [];

    const zaiOptions = await parseProviderOptions({
      provider: 'zai',
      providerOptions: options.providerOptions,
      schema: zaiLanguageModelChatOptions,
    });

    if (options.frequencyPenalty != null) {
      warnings.push({ type: 'unsupported', feature: 'frequencyPenalty' });
    }
    if (options.presencePenalty != null) {
      warnings.push({ type: 'unsupported', feature: 'presencePenalty' });
    }
    if (options.seed != null) {
      warnings.push({ type: 'unsupported', feature: 'seed' });
    }

    let tools = options.tools;
    let toolChoice = options.toolChoice;

    if (toolChoice?.type === 'none') {
      tools = undefined;
      toolChoice = undefined;
    } else if (toolChoice != null && toolChoice.type !== 'auto') {
      warnings.push({
        type: 'unsupported',
        feature: `toolChoice ${toolChoice.type}`,
        details: 'Z.AI currently supports only automatic tool selection.',
      });
      toolChoice = undefined;
    }

    const normalizedOptions: LanguageModelV3CallOptions = {
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
    options: LanguageModelV3CallOptions,
  ): Promise<LanguageModelV3GenerateResult> {
    const { normalizedOptions, warnings } =
      await this.prepareCallOptions(options);
    const result = await super.doGenerate(normalizedOptions);

    return {
      ...result,
      finishReason: mapZaiFinishReason(result.finishReason),
      warnings: [...result.warnings, ...warnings],
    };
  }

  async doStream(
    options: LanguageModelV3CallOptions,
  ): Promise<LanguageModelV3StreamResult> {
    const { normalizedOptions, warnings } =
      await this.prepareCallOptions(options);
    const result = await super.doStream(normalizedOptions);

    return {
      ...result,
      stream: result.stream.pipeThrough(
        new TransformStream<
          LanguageModelV3StreamPart,
          LanguageModelV3StreamPart
        >({
          transform(part, controller) {
            if (part.type === 'stream-start') {
              controller.enqueue({
                ...part,
                warnings: [...part.warnings, ...warnings],
              });
              return;
            }

            if (part.type === 'finish') {
              controller.enqueue({
                ...part,
                finishReason: mapZaiFinishReason(part.finishReason),
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
