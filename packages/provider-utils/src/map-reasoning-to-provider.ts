import type {
  LanguageModelV4CallOptions,
  SharedV4Warning,
} from '@ai-sdk/provider';

export type ReasoningLevel = Exclude<
  LanguageModelV4CallOptions['reasoning'],
  'none' | 'provider-default' | undefined
>;

/**
 * Reasoning levels in ascending order.
 */
const REASONING_LEVELS: readonly ReasoningLevel[] = [
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh',
  'max',
];

export function isCustomReasoning(
  reasoning: LanguageModelV4CallOptions['reasoning'],
): reasoning is ReasoningLevel | 'none' {
  return reasoning !== undefined && reasoning !== 'provider-default';
}

/**
 * Maps a top-level reasoning value to a provider-specific effort string.
 *
 * A `providerOptionsEffort` (the reasoning effort set in provider options) is
 * returned unchanged. Otherwise, `undefined` and `'provider-default'` return
 * `undefined`, and other reasoning values are mapped with the effort map.
 *
 * The effort map should only contain the values that the model supports. An
 * unsupported value maps to the next lower supported level, or the next higher
 * one if there is no lower level. `'none'` is never used as a fallback, so an
 * unsupported `'none'` maps to the lowest supported level.
 *
 * Pushes a compatibility warning if the effort that is sent differs from the
 * requested value, or an unsupported warning if the effort map is empty.
 *
 * @returns The provider options effort, the mapped effort string, or
 *   `undefined` if no effort should be sent.
 */
export function mapReasoningToProviderEffort<
  T extends string,
  P extends string = never,
>({
  reasoning,
  effortMap,
  providerOptionsEffort,
  warnings,
}: {
  reasoning: LanguageModelV4CallOptions['reasoning'];
  effortMap: Partial<Record<ReasoningLevel | 'none', T>>;
  providerOptionsEffort?: P | null;
  warnings: SharedV4Warning[];
}): T | P | undefined {
  if (providerOptionsEffort != null) {
    return providerOptionsEffort;
  }

  if (!isCustomReasoning(reasoning)) {
    return undefined;
  }

  // indexOf is -1 for 'none', so every level is a higher fallback.
  const index = REASONING_LEVELS.indexOf(reasoning as ReasoningLevel);
  const level = [
    reasoning,
    ...REASONING_LEVELS.slice(0, Math.max(index, 0)).reverse(),
    ...REASONING_LEVELS.slice(index + 1),
  ].find(candidate => effortMap[candidate] != null);

  if (level == null) {
    warnings.push({
      type: 'unsupported',
      feature: 'reasoning',
      details: `reasoning "${reasoning}" is not supported by this model.`,
    });
    return undefined;
  }

  const mapped = effortMap[level]!;

  if (mapped !== reasoning) {
    warnings.push({
      type: 'compatibility',
      feature: 'reasoning',
      details: `reasoning "${reasoning}" is not directly supported by this model. mapped to effort "${mapped}".`,
    });
  }

  return mapped;
}

const DEFAULT_REASONING_BUDGET_PERCENTAGES: Record<ReasoningLevel, number> = {
  minimal: 0.02,
  low: 0.1,
  medium: 0.3,
  high: 0.6,
  xhigh: 0.9,
  max: 0.95,
};

/**
 * Maps a top-level reasoning value to an absolute token budget by multiplying
 * the model's max output tokens by a percentage for the level. Levels missing
 * from `budgetPercentages` use the default percentages. The result is clamped
 * between `minReasoningBudget` (default 1024) and `maxReasoningBudget`.
 *
 * Handle `'none'` before calling this function when the model can disable
 * reasoning. Otherwise, `'none'` maps to `minReasoningBudget` with a
 * compatibility warning.
 *
 * @returns The computed token budget.
 */
export function mapReasoningToProviderBudget({
  reasoning,
  maxOutputTokens,
  maxReasoningBudget,
  minReasoningBudget = 1024,
  budgetPercentages,
  warnings,
}: {
  reasoning: ReasoningLevel | 'none';
  maxOutputTokens: number;
  maxReasoningBudget: number;
  minReasoningBudget?: number;
  budgetPercentages?: Partial<Record<ReasoningLevel, number>>;
  warnings: SharedV4Warning[];
}): number {
  if (reasoning === 'none') {
    warnings.push({
      type: 'compatibility',
      feature: 'reasoning',
      details: `reasoning "none" is not supported by this model. mapped to the minimum reasoning budget of ${minReasoningBudget} tokens.`,
    });
    return minReasoningBudget;
  }

  const percentage =
    budgetPercentages?.[reasoning] ??
    DEFAULT_REASONING_BUDGET_PERCENTAGES[reasoning];

  return Math.min(
    maxReasoningBudget,
    Math.max(minReasoningBudget, Math.round(maxOutputTokens * percentage)),
  );
}
