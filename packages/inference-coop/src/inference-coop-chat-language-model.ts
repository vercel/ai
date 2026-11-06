import { OpenAICompatibleChatLanguageModel } from '@ai-sdk/openai-compatible';
import type { LanguageModelV4 } from '@ai-sdk/provider';
import {
  serializeModelOptions,
  WORKFLOW_DESERIALIZE,
  WORKFLOW_SERIALIZE,
} from '@ai-sdk/provider-utils';
import { INFERENCE_COOP_DEFAULT_BASE_URL } from './inference-coop-config';
import type { InferenceCoopChatModelId } from './inference-coop-chat-language-model-options';

type InferenceCoopChatConfig = Omit<
  ConstructorParameters<typeof OpenAICompatibleChatLanguageModel>[1],
  'url'
> & {
  url?: ConstructorParameters<
    typeof OpenAICompatibleChatLanguageModel
  >[1]['url'];

  /**
   * Serializable base URL of the gateway. The `url` function is dropped by
   * workflow serialization, so it is rebuilt from this value on
   * deserialization.
   */
  baseURL?: string;
};

/**
 * Inference Cooperative chat completions over the OpenAI-compatible protocol.
 * The gateway speaks standard OpenAI chat completions, so the shared
 * OpenAI-compatible implementation is used unchanged.
 */
export class InferenceCoopChatLanguageModel
  extends OpenAICompatibleChatLanguageModel
  implements LanguageModelV4
{
  constructor(
    modelId: InferenceCoopChatModelId,
    config: InferenceCoopChatConfig,
  ) {
    super(modelId, {
      ...config,
      url:
        config.url ??
        (({ path }) =>
          `${config.baseURL ?? INFERENCE_COOP_DEFAULT_BASE_URL}${path}`),
    });
  }

  static [WORKFLOW_SERIALIZE](model: InferenceCoopChatLanguageModel) {
    return serializeModelOptions({
      modelId: model.modelId,
      config: model.config,
    });
  }

  static [WORKFLOW_DESERIALIZE](options: {
    modelId: InferenceCoopChatModelId;
    config: InferenceCoopChatConfig;
  }) {
    return new InferenceCoopChatLanguageModel(options.modelId, options.config);
  }
}
