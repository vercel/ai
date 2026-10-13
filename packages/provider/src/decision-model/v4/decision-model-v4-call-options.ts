import type { SharedV4Headers, SharedV4ProviderOptions } from '../../shared/v4';
import type { DecisionModelV4Question } from './decision-model-v4-question';
import type { DecisionModelV4State } from './decision-model-v4-state';

export type DecisionModelV4CallOptions = {
  state: DecisionModelV4State;
  questions: Readonly<Record<string, DecisionModelV4Question>>;
  abortSignal?: AbortSignal;
  headers?: SharedV4Headers;
  providerOptions?: SharedV4ProviderOptions;
};
