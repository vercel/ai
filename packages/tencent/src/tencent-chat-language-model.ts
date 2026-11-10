import { OpenAICompatibleChatLanguageModel } from '@ai-sdk/openai-compatible';
import type { LanguageModelV4 } from '@ai-sdk/provider';
import {
  type FetchFunction,
  type Resolvable,
  serializeModelOptions,
  WORKFLOW_DESERIALIZE,
  WORKFLOW_SERIALIZE,
} from '@ai-sdk/provider-utils';
import type { TencentChatModelId } from './tencent-chat-language-model-options';

type OpenAICompatibleChatConfig = ConstructorParameters<
  typeof OpenAICompatibleChatLanguageModel
>[1];

type TencentChatConfig = {
  provider: string;
  baseURL: string;
  headers?: Resolvable<Record<string, string | undefined>>;
  fetch?: FetchFunction;
};

/**
 * TokenHub chat completions over the OpenAI-compatible protocol.
 *
 * Serializes its own config because the parent's `url` callback does not
 * survive workflow serialization; the URL is rebuilt from `baseURL`.
 */
export class TencentChatLanguageModel
  extends OpenAICompatibleChatLanguageModel
  implements LanguageModelV4
{
  private readonly tencentConfig: TencentChatConfig;

  static [WORKFLOW_SERIALIZE](model: TencentChatLanguageModel) {
    return serializeModelOptions({
      modelId: model.modelId,
      config: model.tencentConfig,
    });
  }

  // The parameter type must match the parent's static signature; the
  // serialized config is a `TencentChatConfig`.
  static [WORKFLOW_DESERIALIZE](options: {
    modelId: string;
    config: OpenAICompatibleChatConfig;
  }) {
    return new TencentChatLanguageModel(
      options.modelId,
      options.config as unknown as TencentChatConfig,
    );
  }

  constructor(modelId: TencentChatModelId, config: TencentChatConfig) {
    super(modelId, {
      provider: config.provider,
      url: ({ path }) => `${config.baseURL}${path}`,
      headers: config.headers,
      fetch: config.fetch,
      includeUsage: true,
    });
    this.tencentConfig = config;
  }
}
