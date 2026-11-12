import type { DecisionModelV4State } from '../../decision-model/v4/decision-model-v4-state';
import type { LanguageModelV4CallOptions } from '../../language-model/v4/language-model-v4-call-options';
import type { SharedV4Headers, SharedV4ProviderOptions } from '../../shared/v4';
import type { ExtractionModelV4Field } from './extraction-model-v4-field';

export type ExtractionModelV4CallOptions = {
  /** Ordered text, file, and JSON parts. Answer sources index into this array. */
  state: DecisionModelV4State;
  fields: Readonly<Record<string, ExtractionModelV4Field>>;
  /** `YYYY-MM-DD` date that anchors relative dates and dates without a year. */
  referenceDate?: string;
  maxOutputTokens?: number;
  /** Reasoning effort for supported models. */
  reasoning?: LanguageModelV4CallOptions['reasoning'];
  abortSignal?: AbortSignal;
  headers?: SharedV4Headers;
  providerOptions?: SharedV4ProviderOptions;
};
