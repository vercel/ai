import { OpenAICompatibleChatLanguageModel } from '@ai-sdk/openai-compatible';
import type { LanguageModelV4 } from '@ai-sdk/provider';
import {
  serializeModelOptions,
  WORKFLOW_DESERIALIZE,
  WORKFLOW_SERIALIZE,
} from '@ai-sdk/provider-utils';
import type { ByteDanceChatModelId } from './bytedance-chat-language-model-options';

type ByteDanceChatConfig = ConstructorParameters<
  typeof OpenAICompatibleChatLanguageModel
>[1];

export class ByteDanceChatLanguageModel
  extends OpenAICompatibleChatLanguageModel
  implements LanguageModelV4
{
  static [WORKFLOW_SERIALIZE](model: ByteDanceChatLanguageModel) {
    return serializeModelOptions({
      modelId: model.modelId,
      config: model.config,
    });
  }

  static [WORKFLOW_DESERIALIZE](options: {
    modelId: ByteDanceChatModelId;
    config: ByteDanceChatConfig;
  }) {
    return new ByteDanceChatLanguageModel(options.modelId, options.config);
  }
}
