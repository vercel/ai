import type { DecisionModelV4CallOptions } from './decision-model-v4-call-options';
import type { DecisionModelV4Question } from './decision-model-v4-question';
import type { DecisionModelV4Result } from './decision-model-v4-result';

/** Experimental decision model contract. May change in patch releases. */
export type DecisionModelV4 = {
  readonly specificationVersion: 'v4';
  readonly provider: string;
  readonly modelId: string;
  /** Supported question types, used to reject unsupported calls before any I/O. */
  readonly supportedQuestionTypes: readonly DecisionModelV4Question['type'][];
  /** Evaluate every question against the same state. No partial results. */
  doDecide(
    options: DecisionModelV4CallOptions,
  ): PromiseLike<DecisionModelV4Result>;
};
