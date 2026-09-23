import type { SharedV4Headers, SharedV4ProviderOptions } from '../../shared/v4';
import type {
  EvaluationModelV4Input,
  EvaluationModelV4Question,
} from './evaluation-model-v4-question';

export type EvaluationModelV4CallOptions = {
  /** One shared state, even when the value is an array. */
  state: EvaluationModelV4Input;
  questions: Readonly<Record<string, EvaluationModelV4Question>>;
  abortSignal?: AbortSignal;
  headers?: SharedV4Headers;
  providerOptions?: SharedV4ProviderOptions;
};
