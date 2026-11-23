import type { HumeModelIds } from './hume-model-catalog';

export type HumeDecisionModelId = HumeModelIds['decision'] | (string & {});

/** Hume decision models do not support provider-specific options. */
export type HumeDecisionModelOptions = Record<string, never>;
