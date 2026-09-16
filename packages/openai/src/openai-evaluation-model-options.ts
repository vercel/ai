import type { LanguageModelV4CallOptions } from '@ai-sdk/provider';

/** Explicit evaluation support. Add each new model with its lowest supported effort. */
export const openaiEvaluationModels = {
  'gpt-5': { reasoningEffort: 'minimal' },
  'gpt-5-mini': { reasoningEffort: 'minimal' },
  'gpt-5-nano': { reasoningEffort: 'minimal' },
  'gpt-5.1': { reasoningEffort: 'none' },
  'gpt-5.2': { reasoningEffort: 'none' },
  'gpt-5.4': { reasoningEffort: 'none' },
  'gpt-5.4-mini': { reasoningEffort: 'none' },
  'gpt-5.4-nano': { reasoningEffort: 'none' },
  'gpt-5.5': { reasoningEffort: 'none' },
  'gpt-5.6': { reasoningEffort: 'none' },
  'gpt-5.6-luna': { reasoningEffort: 'none' },
  'gpt-5.6-sol': { reasoningEffort: 'none' },
  'gpt-5.6-terra': { reasoningEffort: 'none' },
  'gpt-6-astra': { reasoningEffort: 'low' },
} as const satisfies Record<
  string,
  {
    reasoningEffort: NonNullable<LanguageModelV4CallOptions['reasoning']>;
  }
>;

export type OpenAIEvaluationModelId = keyof typeof openaiEvaluationModels;
