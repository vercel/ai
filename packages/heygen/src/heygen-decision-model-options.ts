import type { HeyGenModelIds } from './heygen-model-catalog';

export type HeyGenDecisionModelId = HeyGenModelIds['decision'] | (string & {});

/** HeyGen decision models do not support provider-specific options. */
export type HeyGenDecisionModelOptions = Record<string, never>;
