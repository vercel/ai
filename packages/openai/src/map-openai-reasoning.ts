import type {
  LanguageModelV4CallOptions,
  SharedV4Warning,
} from '@ai-sdk/provider';
import { isCustomReasoning } from '@ai-sdk/provider-utils';
import { getOpenAILanguageModelCapabilities } from './openai-language-model-capabilities';

/** Only normalize the shared setting; explicit provider efforts are validated separately. */
export function mapOpenAIReasoning({
  reasoning,
  modelId,
  warnings,
}: {
  reasoning: LanguageModelV4CallOptions['reasoning'];
  modelId: string;
  warnings: SharedV4Warning[];
}): string | undefined {
  if (!isCustomReasoning(reasoning)) {
    return undefined;
  }

  if (reasoning !== 'none') {
    return reasoning;
  }

  const minimum = getMinimumReasoningEffort(modelId);

  if (minimum == null) {
    return reasoning;
  }

  warnings.push({
    type: 'compatibility',
    feature: 'reasoning',
    details: `reasoning "none" is not supported by this model. Using reasoning effort "${minimum}" instead.`,
  });
  return minimum;
}

function getMinimumReasoningEffort(modelId: string): string | undefined {
  // The capability table already treats GPT-6 and later generations alike.
  // Reuse its ordered efforts without expanding validation of explicit options.
  const supportedEfforts =
    getOpenAILanguageModelCapabilities(modelId).supportedReasoningEfforts;
  if (supportedEfforts != null) {
    return supportedEfforts.includes('none') ? undefined : supportedEfforts[0];
  }

  // Keep legacy exceptions before the family defaults. Version/suffix matching
  // includes future minor releases and snapshots, without matching custom IDs.
  if (/^gpt-5-pro(?:-|$)/.test(modelId)) {
    return 'high';
  }
  if (/^gpt-5\.\d+-pro(?:-|$)/.test(modelId)) {
    return 'medium';
  }
  // Codex Mini has a higher minimum than the other Codex variants.
  if (/^gpt-5(?:\.\d+)?-codex-mini(?:-|$)/.test(modelId)) {
    return 'medium';
  }
  if (/^gpt-5(?:\.\d+)?-codex(?:-|$)/.test(modelId)) {
    return 'low';
  }
  if (/^gpt-5(?:-(?:mini|nano))?(?:-\d{4}-\d{2}-\d{2})?$/.test(modelId)) {
    return 'minimal';
  }
  if (
    /^o\d+(?:-mini)?(?:-\d{4}-\d{2}-\d{2})?$/.test(modelId) &&
    !/^o1-mini(?:-|$)/.test(modelId)
  ) {
    return 'low';
  }

  return undefined;
}
