import type { BasetenModelIds } from './baseten-model-catalog';

export type BasetenDecisionModelId =
  | BasetenModelIds['decision']
  | (string & {});

/** Baseten decision models do not support provider-specific options. */
export type BasetenDecisionModelOptions = Record<string, never>;
