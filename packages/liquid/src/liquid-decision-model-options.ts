import type { LiquidModelIds } from './liquid-model-catalog';

export type LiquidDecisionModelId = LiquidModelIds['decision'] | (string & {});

/** Liquid decision models do not support provider-specific options. */
export type LiquidDecisionModelOptions = Record<string, never>;
