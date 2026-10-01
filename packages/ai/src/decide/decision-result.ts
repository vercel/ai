import type {
  Experimental_DecisionModelV4 as DecisionModelV4,
  Experimental_EvaluationModelV4 as EvaluationModelV4,
  Experimental_DecisionModelV4Question as DecisionModelV4Question,
  Experimental_DecisionModelV4Result as DecisionModelV4Result,
} from '@ai-sdk/provider';

export type DecisionModel = string | DecisionModelV4 | EvaluationModelV4;
export type DecisionQuestion = DecisionModelV4Question;

export type DecisionAnswer<QUESTION extends DecisionQuestion> =
  QUESTION extends { type: 'choice'; criteria: infer CRITERIA }
    ? {
        type: 'choice';
        choice: Extract<keyof CRITERIA, string>;
        probabilities?: Record<Extract<keyof CRITERIA, string>, number>;
      }
    : QUESTION extends { type: 'score' }
      ? { type: 'score'; score: number; probabilities?: Record<string, number> }
      : { type: 'boolean'; probability: number };

export type DecisionResult<QUESTIONS extends Record<string, DecisionQuestion>> =
  {
    readonly answers: {
      [ID in keyof QUESTIONS]: DecisionAnswer<QUESTIONS[ID]>;
    };
    readonly usage: {
      inputTokens: number | undefined;
      outputTokens: number | undefined;
      totalTokens: number | undefined;
    };
    readonly warnings: DecisionModelV4Result['warnings'];
    readonly rounding: DecisionModelV4Result['rounding'];
    readonly providerMetadata: DecisionModelV4Result['providerMetadata'];
    readonly response: NonNullable<DecisionModelV4Result['response']> & {
      timestamp: Date;
      modelId: string;
    };
  };
