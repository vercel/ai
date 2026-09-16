import { OpenAICompatibleChatLanguageModel } from '@ai-sdk/openai-compatible';
import type { LanguageModelV4 } from '@ai-sdk/provider';
import {
  serializeModelOptions,
  WORKFLOW_DESERIALIZE,
  WORKFLOW_SERIALIZE,
} from '@ai-sdk/provider-utils';
import type { NebulChatModelId } from './nebul-chat-options';

type NebulChatConfig = ConstructorParameters<
  typeof OpenAICompatibleChatLanguageModel
>[1];

export class NebulChatLanguageModel
  extends OpenAICompatibleChatLanguageModel
  implements LanguageModelV4
{
  static [WORKFLOW_SERIALIZE](model: NebulChatLanguageModel) {
    return serializeModelOptions({
      modelId: model.modelId,
      config: model.config,
    });
  }

  static [WORKFLOW_DESERIALIZE](options: {
    modelId: NebulChatModelId;
    config: NebulChatConfig;
  }) {
    return new NebulChatLanguageModel(options.modelId, options.config);
  }
}
