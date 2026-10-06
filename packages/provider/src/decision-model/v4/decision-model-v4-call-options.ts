import type { SharedV4Headers, SharedV4ProviderOptions } from '../../shared/v4';
import type {
  DecisionModelV4Input,
  DecisionModelV4Question,
} from './decision-model-v4-question';

export type DecisionModelV4CallOptions = {
  /** One shared state, even when the value is an array. */
  state: DecisionModelV4Input;
  questions: Readonly<Record<string, DecisionModelV4Question>>;
  abortSignal?: AbortSignal;
  headers?: SharedV4Headers;
  providerOptions?: SharedV4ProviderOptions;
};
