import type { Experimental_DecisionModelV4 as DecisionModelV4 } from '@ai-sdk/provider';

/** Structural extension; decision is not part of the stable provider contract. */
export type DecisionProvider = {
  decisionModel?: (modelId: string) => DecisionModelV4;
};
