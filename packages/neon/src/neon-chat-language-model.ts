import { OpenAICompatibleChatLanguageModel } from '@ai-sdk/openai-compatible';
import type { LanguageModelV4 } from '@ai-sdk/provider';
import {
  serializeModelOptions,
  WORKFLOW_DESERIALIZE,
  WORKFLOW_SERIALIZE,
} from '@ai-sdk/provider-utils';
import type { NeonChatModelId } from './neon-chat-options';

type NeonChatConfig = ConstructorParameters<
  typeof OpenAICompatibleChatLanguageModel
>[1];

/**
 * Language model for the Neon AI Gateway unified (MLflow) endpoint.
 *
 * The Neon gateway exposes every foundation model (Anthropic, OpenAI, Google,
 * Meta, ...) through a single OpenAI-compatible `chat/completions` surface, so
 * this model is a thin specialization of the shared OpenAI-compatible chat
 * model that adds workflow serialization support and Neon-specific naming.
 */
export class NeonChatLanguageModel
  extends OpenAICompatibleChatLanguageModel
  implements LanguageModelV4
{
  static [WORKFLOW_SERIALIZE](model: NeonChatLanguageModel) {
    return serializeModelOptions({
      modelId: model.modelId,
      config: model.config,
    });
  }

  static [WORKFLOW_DESERIALIZE](options: {
    modelId: NeonChatModelId;
    config: NeonChatConfig;
  }) {
    return new NeonChatLanguageModel(options.modelId, options.config);
  }
}
