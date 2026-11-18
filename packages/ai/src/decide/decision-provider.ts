import type {
  Experimental_DecisionModelV4 as DecisionModelV4,
  Experimental_EvaluationModelV4 as EvaluationModelV4,
} from '@ai-sdk/provider';

/** Structural extension; decision is not part of the stable provider contract. */
export type DecisionProvider = {
  decisionModel?: (modelId: string) => DecisionModelV4;
  /** @deprecated Use `decisionModel` instead. */
  evaluationModel?: (modelId: string) => EvaluationModelV4;
};
