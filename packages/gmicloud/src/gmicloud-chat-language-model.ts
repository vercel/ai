import { OpenAICompatibleChatLanguageModel } from '@ai-sdk/openai-compatible';
import type { LanguageModelV4 } from '@ai-sdk/provider';
import {
  serializeModelOptions,
  WORKFLOW_DESERIALIZE,
  WORKFLOW_SERIALIZE,
} from '@ai-sdk/provider-utils';
import type { GmicloudChatModelId } from './gmicloud-chat-language-model-options';

type GmicloudChatConfig = ConstructorParameters<
  typeof OpenAICompatibleChatLanguageModel
>[1];

/**
 * GMI Cloud chat completions over the OpenAI-compatible protocol. The only
 * customization is the error structure (see ./gmicloud-error.ts): GMI's edge
 * nests the backend engine's diagnostic in `error.details`, which the default
 * OpenAI-compatible error handling drops.
 */
export class GmicloudChatLanguageModel
  extends OpenAICompatibleChatLanguageModel
  implements LanguageModelV4
{
  static [WORKFLOW_SERIALIZE](model: GmicloudChatLanguageModel) {
    return serializeModelOptions({
      modelId: model.modelId,
      config: model.config,
    });
  }

  static [WORKFLOW_DESERIALIZE](options: {
    modelId: GmicloudChatModelId;
    config: GmicloudChatConfig;
  }) {
    return new GmicloudChatLanguageModel(options.modelId, options.config);
  }
}
