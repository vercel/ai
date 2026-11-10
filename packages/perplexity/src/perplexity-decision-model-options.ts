import type { PerplexityModelIds } from './perplexity-model-catalog';

export type PerplexityDecisionModelId =
  | PerplexityModelIds['decision']
  | (string & {});

/** Perplexity decision models do not support provider-specific options. */
export type PerplexityDecisionModelOptions = Record<string, never>;
