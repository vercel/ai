import type {
  LanguageModelV4CallOptions,
  LanguageModelV4StreamPart,
  SharedV4ProviderOptions,
  SharedV4Warning,
} from '@ai-sdk/provider';
import { isCustomReasoning } from '@ai-sdk/provider-utils';
import { getNeonModelCapabilities } from './neon-model-capabilities';

/**
 * Drop call options the resolved model's upstream backend does not accept and
 * collect a warning for each, so callers get a clear signal instead of a hard
 * `400` from the gateway.
 */
export function applyNeonCapabilities(
  modelId: string,
  options: LanguageModelV4CallOptions,
): { options: LanguageModelV4CallOptions; warnings: SharedV4Warning[] } {
  const caps = getNeonModelCapabilities(modelId);
  const warnings: SharedV4Warning[] = [];
  const patch: Partial<LanguageModelV4CallOptions> = {};

  const dropUnsupported = (feature: string) => {
    warnings.push({
      type: 'unsupported',
      feature,
      details: `${feature} is not supported by the Neon AI Gateway for ${caps.family} model "${modelId}" and was dropped.`,
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

  // Anthropic-style models accept only one of temperature / topP.
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

/**
 * Merge additional warnings into the `stream-start` part of a model stream.
 */
export function mergeStreamStartWarnings(extra: SharedV4Warning[]) {
  let merged = false;
  return new TransformStream<
    LanguageModelV4StreamPart,
    LanguageModelV4StreamPart
  >({
    transform(part, controller) {
      if (!merged && part.type === 'stream-start') {
        merged = true;
        controller.enqueue({ ...part, warnings: [...extra, ...part.warnings] });
      } else {
        controller.enqueue(part);
      }
    },
  });
}
