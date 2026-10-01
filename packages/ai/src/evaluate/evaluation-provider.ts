import type { Experimental_EvaluationModelV4 as EvaluationModelV4 } from '@ai-sdk/provider';

/** Structural extension; evaluation is not part of the stable provider contract. */
export type EvaluationProvider = {
  evaluationModel?: (modelId: string) => EvaluationModelV4;
};
