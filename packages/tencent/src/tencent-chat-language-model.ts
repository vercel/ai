import { OpenAICompatibleChatLanguageModel } from '@ai-sdk/openai-compatible';
import type { LanguageModelV4 } from '@ai-sdk/provider';
import {
  serializeModelOptions,
  WORKFLOW_DESERIALIZE,
  WORKFLOW_SERIALIZE,
} from '@ai-sdk/provider-utils';
import type { TencentChatModelId } from './tencent-chat-language-model-options';

type TencentChatConfig = ConstructorParameters<
  typeof OpenAICompatibleChatLanguageModel
>[1];

/**
 * TokenHub chat completions over the OpenAI-compatible protocol.
 */
export class TencentChatLanguageModel
  extends OpenAICompatibleChatLanguageModel
  implements LanguageModelV4
{
  static [WORKFLOW_SERIALIZE](model: TencentChatLanguageModel) {
    return serializeModelOptions({
      modelId: model.modelId,
      config: model.config,
    });
  }

  static [WORKFLOW_DESERIALIZE](options: {
    modelId: TencentChatModelId;
    config: TencentChatConfig;
  }) {
    return new TencentChatLanguageModel(options.modelId, options.config);
  }
}
