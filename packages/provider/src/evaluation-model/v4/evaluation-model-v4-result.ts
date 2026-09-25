import type {
  SharedV4Headers,
  SharedV4ProviderMetadata,
  SharedV4Warning,
} from '../../shared/v4';

export type EvaluationModelV4Answer =
  | {
      type: 'choice';
      /** The selected option, with maximal probability when a distribution exists. */
      choice: string;
      /** Complete distribution over the question's options, when available. */
      probabilities?: Record<string, number>;
    }
  | {
      type: 'score';
      /** Fractional position in [0, number of levels - 1]. */
      score: number;
      /**
       * Complete distribution, keyed by zero-based level indices as strings.
       * When supplied, score is its probability-weighted mean.
       */
      probabilities?: Record<string, number>;
    }
  | {
      type: 'boolean';
      /** Model-estimated P(true), in [0, 1]. Not confidence in either outcome. */
      probability: number;
    };

export type EvaluationModelV4Result = {
  /** Exactly one answer per question, under the original question IDs. */
  answers: Record<string, EvaluationModelV4Answer>;
  /**
   * Decimal places used when the provider rounds its output. Omit for full
   * precision. Core allows half a unit in the last place per rounded value
   * when checking distribution sums and weighted scores, preserving the values.
   */
  rounding?: {
    probabilityDecimals?: number;
    scoreDecimals?: number;
  };
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
  };
  warnings: SharedV4Warning[];
  providerMetadata?: SharedV4ProviderMetadata;
  response?: {
    id?: string;
    timestamp?: Date;
    modelId?: string;
    headers?: SharedV4Headers;
    body?: unknown;
  };
};
