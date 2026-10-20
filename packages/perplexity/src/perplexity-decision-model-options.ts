export type PerplexityDecisionModelId =
  | 'pplx-decider-v1.2'
  | 'pplx-decider-flash-v1.2'
  | 'pplx-decider-latest'
  | 'pplx-decider-flash-latest'
  | 'perplexity/pplx-decider-latest'
  | 'perplexity/pplx-decider-flash-latest'
  | 'pplx-decider-v1.1-27b'
  | 'pplx-decider-v1-27b'
  | (string & {});

/** Perplexity decision models do not support provider-specific options. */
export type PerplexityDecisionModelOptions = Record<string, never>;
