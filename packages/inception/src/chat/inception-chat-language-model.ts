import { OpenAICompatibleChatLanguageModel } from '@ai-sdk/openai-compatible';
import {
  UnsupportedFunctionalityError,
  type LanguageModelV4,
  type LanguageModelV4CallOptions,
} from '@ai-sdk/provider';
import {
  mapReasoningToProviderEffort,
  parseProviderOptions,
  serializeModelOptions,
  WORKFLOW_DESERIALIZE,
  WORKFLOW_SERIALIZE,
  type FetchFunction,
  type Resolvable,
} from '@ai-sdk/provider-utils';
import {
  inceptionLanguageModelChatOptions,
  type InceptionChatModelId,
} from './inception-chat-language-model-options';
import { convertInceptionUsage } from './convert-inception-usage';

type InceptionChatConfig = {
  provider: string;
  baseURL?: string;
  headers?: Resolvable<Record<string, string | undefined>>;
  fetch?: FetchFunction;
};

export class InceptionChatLanguageModel
  extends OpenAICompatibleChatLanguageModel
  implements LanguageModelV4
{
  static [WORKFLOW_SERIALIZE](model: InceptionChatLanguageModel) {
    return serializeModelOptions({
      modelId: model.modelId,
      config: model.config,
    });
  }

  static [WORKFLOW_DESERIALIZE](options: {
    modelId: InceptionChatModelId;
    config: InceptionChatConfig;
  }) {
    return new InceptionChatLanguageModel(options.modelId, options.config);
  }

  constructor(modelId: InceptionChatModelId, config: InceptionChatConfig) {
    super(modelId, {
      ...config,
      url: ({ path }) =>
        `${config.baseURL ?? 'https://api.inceptionlabs.ai/v1'}${path}`,
      includeUsage: true,
      supportsStructuredOutputs: true,
      convertUsage: convertInceptionUsage,
      mapReasoning: ({ reasoning, warnings }) =>
        mapReasoningToProviderEffort({
          reasoning,
          effortMap: {
            none: 'instant',
            minimal: 'instant',
            low: 'low',
            medium: 'medium',
            high: 'high',
          },
          warnings,
        }),
      transformRequestBody: (args, warnings) => {
        const {
          max_tokens,
          top_p,
          frequency_penalty,
          presence_penalty,
          seed,
          ...body
        } = args;

        for (const [feature, value] of [
          ['topP', top_p],
          ['frequencyPenalty', frequency_penalty],
          ['presencePenalty', presence_penalty],
          ['seed', seed],
        ] as const) {
          if (value != null) {
            warnings?.push({ type: 'unsupported', feature });
          }
        }

        return { ...body, max_completion_tokens: max_tokens };
      },
    });
  }

  async doGenerate(options: LanguageModelV4CallOptions) {
    return super.doGenerate(await this.prepareOptions(options));
  }

  async doStream(options: LanguageModelV4CallOptions) {
    return super.doStream(await this.prepareOptions(options));
  }

  async prepareRequest(options: LanguageModelV4CallOptions) {
    return super.prepareRequest(await this.prepareOptions(options));
  }

  private async prepareOptions(options: LanguageModelV4CallOptions) {
    for (const message of options.prompt) {
      if (message.role === 'user' || message.role === 'assistant') {
        for (const part of message.content) {
          if (part.type === 'file') {
            throw new UnsupportedFunctionalityError({
              functionality: 'File inputs for Inception chat models',
            });
          }
        }
      }
    }

    const inceptionOptions = await parseProviderOptions({
      provider: 'inception',
      providerOptions: options.providerOptions,
      schema: inceptionLanguageModelChatOptions,
    });

    return {
      ...options,
      providerOptions: {
        inception: inceptionOptions ?? {},
      },
    };
  }
}
