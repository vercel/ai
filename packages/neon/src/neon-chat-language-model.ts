import { OpenAICompatibleChatLanguageModel } from '@ai-sdk/openai-compatible';
import type {
  LanguageModelV4,
  LanguageModelV4CallOptions,
  LanguageModelV4GenerateResult,
  LanguageModelV4StreamPart,
  LanguageModelV4StreamResult,
  SharedV4ProviderOptions,
  SharedV4Warning,
} from '@ai-sdk/provider';
import {
  isCustomReasoning,
  serializeModelOptions,
  WORKFLOW_DESERIALIZE,
  WORKFLOW_SERIALIZE,
} from '@ai-sdk/provider-utils';
import { getNeonModelCapabilities } from './neon-model-capabilities';
import type { NeonChatModelId } from './neon-chat-options';

type NeonChatConfig = ConstructorParameters<
  typeof OpenAICompatibleChatLanguageModel
>[1];

/**
 * Merge additional warnings into the `stream-start` part of a model stream.
 */
function mergeStreamStartWarnings(extra: SharedV4Warning[]) {
  let merged = false;
  return new TransformStream<
    LanguageModelV4StreamPart,
    LanguageModelV4StreamPart
  >({
    transform(part, controller) {
      if (!merged && part.type === 'stream-start') {
        merged = true;
        controller.enqueue({
          ...part,
          warnings: [...extra, ...part.warnings],
        });
      } else {
        controller.enqueue(part);
      }
    },
  });
}

/**
 * Language model for the Neon AI Gateway unified (MLflow) endpoint.
 *
 * The Neon gateway exposes every foundation model (Anthropic, OpenAI, Google,
 * Meta, ...) through a single OpenAI-compatible `chat/completions` surface. This
 * model is a thin specialization of the shared OpenAI-compatible chat model that
 * adds workflow serialization support, Neon-specific naming, and per-model
 * capability handling: parameters an upstream backend is known to reject are
 * dropped and reported as warnings instead of failing the request.
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

  /**
   * Drop call options the resolved model's upstream backend does not accept and
   * collect a warning for each, so callers get a clear signal instead of a hard
   * `400` from the gateway.
   */
  private adjustForCapabilities(options: LanguageModelV4CallOptions): {
    options: LanguageModelV4CallOptions;
    warnings: SharedV4Warning[];
  } {
    const caps = getNeonModelCapabilities(this.modelId);
    const warnings: SharedV4Warning[] = [];
    const patch: Partial<LanguageModelV4CallOptions> = {};

    const dropUnsupported = (feature: string) => {
      warnings.push({
        type: 'unsupported',
        feature,
        details: `${feature} is not supported by the Neon AI Gateway for ${caps.family} model "${this.modelId}" and was dropped.`,
      });
    };

    if (options.temperature != null && !caps.supportsTemperature) {
      patch.temperature = undefined;
      dropUnsupported('temperature');
    }
    if (options.topP != null && !caps.supportsTopP) {
      patch.topP = undefined;
      dropUnsupported('topP');
    }

    // Anthropic models accept only one of temperature / topP.
    const effectiveTemperature =
      'temperature' in patch ? patch.temperature : options.temperature;
    const effectiveTopP = 'topP' in patch ? patch.topP : options.topP;
    if (
      caps.temperatureTopPMutuallyExclusive &&
      effectiveTemperature != null &&
      effectiveTopP != null
    ) {
      patch.topP = undefined;
      warnings.push({
        type: 'compatibility',
        feature: 'topP',
        details: `${caps.family} models accept only one of temperature or topP; topP was dropped.`,
      });
    }

    if (options.frequencyPenalty != null && !caps.supportsPenalties) {
      patch.frequencyPenalty = undefined;
      dropUnsupported('frequencyPenalty');
    }
    if (options.presencePenalty != null && !caps.supportsPenalties) {
      patch.presencePenalty = undefined;
      dropUnsupported('presencePenalty');
    }
    if (options.seed != null && !caps.supportsSeed) {
      patch.seed = undefined;
      dropUnsupported('seed');
    }
    if (options.stopSequences != null && !caps.supportsStopSequences) {
      patch.stopSequences = undefined;
      dropUnsupported('stopSequences');
    }

    if (!caps.supportsReasoningEffort) {
      const { providerOptions } = options;
      const hasProviderEffort =
        providerOptions != null &&
        Object.values(providerOptions).some(
          group => 'reasoningEffort' in group && group.reasoningEffort != null,
        );
      const hasReasoningOption =
        isCustomReasoning(options.reasoning) && options.reasoning !== 'none';

      if (hasProviderEffort || hasReasoningOption) {
        dropUnsupported('reasoningEffort');
        if (hasProviderEffort && providerOptions != null) {
          const cleaned: SharedV4ProviderOptions = {};
          for (const [key, group] of Object.entries(providerOptions)) {
            if ('reasoningEffort' in group) {
              const { reasoningEffort: _removed, ...rest } = group;
              cleaned[key] = rest;
            } else {
              cleaned[key] = group;
            }
          }
          patch.providerOptions = cleaned;
        }
        if (hasReasoningOption) {
          patch.reasoning = undefined;
        }
      }
    }

    if (Object.keys(patch).length === 0) {
      return { options, warnings };
    }
    return { options: { ...options, ...patch }, warnings };
  }

  override async doGenerate(
    options: LanguageModelV4CallOptions,
  ): Promise<LanguageModelV4GenerateResult> {
    const { options: adjusted, warnings } = this.adjustForCapabilities(options);
    const result = await super.doGenerate(adjusted);
    return warnings.length > 0
      ? { ...result, warnings: [...warnings, ...result.warnings] }
      : result;
  }

  override async doStream(
    options: LanguageModelV4CallOptions,
  ): Promise<LanguageModelV4StreamResult> {
    const { options: adjusted, warnings } = this.adjustForCapabilities(options);
    const result = await super.doStream(adjusted);
    return warnings.length > 0
      ? {
          ...result,
          stream: result.stream.pipeThrough(mergeStreamStartWarnings(warnings)),
        }
      : result;
  }
}
