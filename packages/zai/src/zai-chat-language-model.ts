import { OpenAICompatibleChatLanguageModel } from '@ai-sdk/openai-compatible';
import type {
  LanguageModelV4,
  LanguageModelV4CallOptions,
  LanguageModelV4FinishReason,
  LanguageModelV4GenerateResult,
  LanguageModelV4StreamPart,
  LanguageModelV4StreamResult,
  SharedV4Warning,
} from '@ai-sdk/provider';
import {
  parseProviderOptions,
  serializeModelOptions,
  WORKFLOW_DESERIALIZE,
  WORKFLOW_SERIALIZE,
  type FetchFunction,
} from '@ai-sdk/provider-utils';
import type { ZaiChatModelId } from './zai-chat-options';
import { zaiLanguageModelChatOptions } from './zai-chat-language-model-options';
import { zaiErrorStructure } from './zai-error';

type OpenAICompatibleChatConfig = ConstructorParameters<
  typeof OpenAICompatibleChatLanguageModel
>[1];

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
  finishReason: LanguageModelV4FinishReason,
): LanguageModelV4FinishReason {
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
  implements LanguageModelV4
{
  private readonly zaiConfig: ZaiChatConfig;

  static [WORKFLOW_SERIALIZE](model: ZaiChatLanguageModel) {
    return serializeModelOptions({
      modelId: model.modelId,
      config: model.zaiConfig,
    });
  }

  static [WORKFLOW_DESERIALIZE](options: {
    modelId: string;
    config: OpenAICompatibleChatConfig;
  }) {
    return new ZaiChatLanguageModel(
      options.modelId,
      options.config as unknown as ZaiChatConfig,
    );
  }

  constructor(modelId: ZaiChatModelId, config: ZaiChatConfig) {
    const headers = config.headers;

    super(modelId, {
      provider: config.provider,
      url: ({ path }) => `${config.baseURL}${path}`,
      headers:
        headers == null
          ? undefined
          : () => (typeof headers === 'function' ? headers() : headers),
      fetch: config.fetch,
      errorStructure: zaiErrorStructure,
      transformRequestBody: transformZaiRequestBody,
      supportedUrls: () => ({
        'image/*': [/^https?:\/\//],
        'video/*': [/^https?:\/\//],
      }),
    });

    this.zaiConfig = config;
  }

  private async prepareCallOptions(options: LanguageModelV4CallOptions) {
    const warnings: SharedV4Warning[] = [];

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

    const normalizedOptions: LanguageModelV4CallOptions = {
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
    options: LanguageModelV4CallOptions,
  ): Promise<LanguageModelV4GenerateResult> {
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
    options: LanguageModelV4CallOptions,
  ): Promise<LanguageModelV4StreamResult> {
    const { normalizedOptions, warnings } =
      await this.prepareCallOptions(options);
    const result = await super.doStream(normalizedOptions);

    return {
      ...result,
      stream: result.stream.pipeThrough(
        new TransformStream<
          LanguageModelV4StreamPart,
          LanguageModelV4StreamPart
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
