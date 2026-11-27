import type { SubquadraticModelIds } from './subquadratic-model-catalog';

// Models: https://docs.subq.ai/endpoints/decisions-api/
export type SubquadraticDecisionModelId =
  | SubquadraticModelIds['decision']
  | (string & {});

/** SubQ decision models do not support provider-specific options. */
export type SubquadraticDecisionModelOptions = Record<string, never>;
