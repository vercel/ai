import type { GoogleModelIds } from './google-model-catalog';

export type GoogleDecisionModelId = GoogleModelIds['decision'] | (string & {});

/** Google decision models do not support provider-specific options. */
export type GoogleDecisionModelOptions = Record<string, never>;
