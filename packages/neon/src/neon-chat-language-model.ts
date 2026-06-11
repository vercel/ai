import { OpenAICompatibleChatLanguageModel } from '@ai-sdk/openai-compatible';
import type {
  LanguageModelV4,
  LanguageModelV4CallOptions,
  LanguageModelV4GenerateResult,
  LanguageModelV4StreamResult,
} from '@ai-sdk/provider';
import {
  serializeModelOptions,
  WORKFLOW_DESERIALIZE,
  WORKFLOW_SERIALIZE,
} from '@ai-sdk/provider-utils';
import {
  applyNeonCapabilities,
  mergeStreamStartWarnings,
} from './neon-capabilities';
import type { NeonChatModelId } from './neon-chat-options';

type NeonChatConfig = ConstructorParameters<
  typeof OpenAICompatibleChatLanguageModel
>[1];

/**
 * Language model for the Neon AI Gateway unified (MLflow) endpoint.
 *
 * Used for every model that is not routed to a provider-native endpoint
 * (Gemini, Llama, Qwen, gpt-oss, ...). It is a thin specialization of the shared
 * OpenAI-compatible chat model that adds workflow serialization, Neon-specific
 * naming, and per-model capability handling (parameters an upstream backend is
 * known to reject are dropped and reported as warnings instead of failing).
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

  override async doGenerate(
    options: LanguageModelV4CallOptions,
  ): Promise<LanguageModelV4GenerateResult> {
    const { options: adjusted, warnings } = applyNeonCapabilities(
      this.modelId,
      options,
    );
    const result = await super.doGenerate(adjusted);
    return warnings.length > 0
      ? { ...result, warnings: [...warnings, ...result.warnings] }
      : result;
  }

  override async doStream(
    options: LanguageModelV4CallOptions,
  ): Promise<LanguageModelV4StreamResult> {
    const { options: adjusted, warnings } = applyNeonCapabilities(
      this.modelId,
      options,
    );
    const result = await super.doStream(adjusted);
    return warnings.length > 0
      ? {
          ...result,
          stream: result.stream.pipeThrough(mergeStreamStartWarnings(warnings)),
        }
      : result;
  }
}
