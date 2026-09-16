import type {
  LanguageModelV4CallOptions,
  SharedV4Warning,
} from '@ai-sdk/provider';
import { isCustomReasoning } from '@ai-sdk/provider-utils';

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

  // Match known model IDs and dated snapshots, not arbitrary deployment names
  // or future model families. Pro variants have different minimum efforts.
  const minimum = /^gpt-6(?:-astra)?(?:-\d{4}-\d{2}-\d{2})?$/.test(modelId)
    ? 'low'
    : /^gpt-5-pro(?:-\d{4}-\d{2}-\d{2})?$/.test(modelId)
      ? 'high'
      : /^gpt-5(?:-mini|-nano)?(?:-\d{4}-\d{2}-\d{2})?$/.test(modelId)
        ? 'minimal'
        : /^(?:o3(?:-mini)?|o4-mini)(?:-\d{4}-\d{2}-\d{2})?$/.test(modelId)
          ? 'low'
          : undefined;

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
