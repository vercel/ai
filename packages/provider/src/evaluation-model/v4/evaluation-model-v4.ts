import type { SharedV4ProviderOptions } from '../../shared';
import type { EvaluationModelV4CallOptions } from './evaluation-model-v4-call-options';
import type { EvaluationModelV4Question } from './evaluation-model-v4-question';
import type { EvaluationModelV4Result } from './evaluation-model-v4-result';

/** Experimental evaluation model contract. May change in patch releases. */
export type EvaluationModelV4<
  ProviderOptions extends SharedV4ProviderOptions = SharedV4ProviderOptions,
> = {
  readonly specificationVersion: 'v4';
  readonly provider: string;
  readonly modelId: string;
  /** Supported question types, used to reject unsupported calls before any I/O. */
  readonly supportedQuestionTypes: readonly EvaluationModelV4Question['type'][];
  /** Evaluate every question against the same state. No partial results. */
  doEvaluate(
    options: EvaluationModelV4CallOptions<ProviderOptions>,
  ): PromiseLike<EvaluationModelV4Result>;
};
