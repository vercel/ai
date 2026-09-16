import type {
  Experimental_EvaluationModelV4 as EvaluationModelV4,
  Experimental_EvaluationModelV4Question as EvaluationModelV4Question,
  Experimental_EvaluationModelV4Result as EvaluationModelV4Result,
} from '@ai-sdk/provider';

export type EvaluationModel = EvaluationModelV4;
export type EvaluationQuestion = EvaluationModelV4Question;

export type EvaluationAnswer<QUESTION extends EvaluationQuestion> =
  QUESTION extends { type: 'choice'; criteria: infer CRITERIA }
    ? {
        type: 'choice';
        choice: Extract<keyof CRITERIA, string>;
        probabilities?: Record<Extract<keyof CRITERIA, string>, number>;
      }
    : QUESTION extends { type: 'score' }
      ? { type: 'score'; score: number; probabilities?: Record<string, number> }
      : { type: 'boolean'; probability: number };

export type EvaluationResult<
  QUESTIONS extends Record<string, EvaluationQuestion>,
> = {
  readonly answers: {
    [ID in keyof QUESTIONS]: EvaluationAnswer<QUESTIONS[ID]>;
  };
  readonly usage: {
    inputTokens: number | undefined;
    outputTokens: number | undefined;
    totalTokens: number | undefined;
  };
  readonly warnings: EvaluationModelV4Result['warnings'];
  readonly rounding: EvaluationModelV4Result['rounding'];
  readonly providerMetadata: EvaluationModelV4Result['providerMetadata'];
  readonly response: NonNullable<EvaluationModelV4Result['response']> & {
    timestamp: Date;
    modelId: string;
  };
};
