import { OpenAICompatibleChatLanguageModel } from '@ai-sdk/openai-compatible';
import {
  serializeModelOptions,
  WORKFLOW_DESERIALIZE,
  WORKFLOW_SERIALIZE,
} from '@ai-sdk/provider-utils';
import type { MiniMaxChatModelId } from './minimax-chat-options';

type MiniMaxChatConfig = ConstructorParameters<
  typeof OpenAICompatibleChatLanguageModel
>[1];

export class MiniMaxChatLanguageModel extends OpenAICompatibleChatLanguageModel {
  static [WORKFLOW_SERIALIZE](model: MiniMaxChatLanguageModel) {
    return serializeModelOptions({
      modelId: model.modelId,
      config: model.config,
    });
  }

  static [WORKFLOW_DESERIALIZE](options: {
    modelId: MiniMaxChatModelId;
    config: MiniMaxChatConfig;
  }) {
    return new MiniMaxChatLanguageModel(options.modelId, options.config);
  }

  constructor(modelId: MiniMaxChatModelId, config: MiniMaxChatConfig) {
    super(modelId, config);
  }
}
