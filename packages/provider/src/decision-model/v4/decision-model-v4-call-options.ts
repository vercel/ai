import type { LanguageModelV4CallOptions } from '../../language-model/v4/language-model-v4-call-options';
import type { SharedV4Headers, SharedV4ProviderOptions } from '../../shared/v4';
import type { DecisionModelV4Question } from './decision-model-v4-question';
import type { DecisionModelV4State } from './decision-model-v4-state';

export type DecisionModelV4CallOptions = {
  state: DecisionModelV4State;
  questions: Readonly<Record<string, DecisionModelV4Question>>;
  maxOutputTokens?: number;
  /** Reasoning effort for supported models. Language-model adapters default to none. */
  reasoning?: LanguageModelV4CallOptions['reasoning'];
  abortSignal?: AbortSignal;
  headers?: SharedV4Headers;
  providerOptions?: SharedV4ProviderOptions;
};
