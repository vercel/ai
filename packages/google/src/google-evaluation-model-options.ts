import type { LanguageModelV4CallOptions } from '@ai-sdk/provider';

/** Explicit evaluation support. Add each new model with its lowest supported effort. */
export const googleEvaluationModels = {
  'gemini-3-pro-preview': { reasoningEffort: 'low' },
  'gemini-3-flash-preview': { reasoningEffort: 'minimal' },
  'gemini-3.1-pro-preview': { reasoningEffort: 'low' },
  'gemini-3.1-pro-preview-customtools': { reasoningEffort: 'low' },
  'gemini-3.1-flash-lite-preview': { reasoningEffort: 'minimal' },
  'gemini-3.5-flash': { reasoningEffort: 'minimal' },
  'gemini-3.5-flash-lite': { reasoningEffort: 'minimal' },
  'gemini-3.6-flash': { reasoningEffort: 'minimal' },
  'gemini-3.7-flash': { reasoningEffort: 'low' },
  'gemini-3.8-flash': { reasoningEffort: 'low' },
} as const satisfies Record<
  string,
  {
    reasoningEffort: NonNullable<LanguageModelV4CallOptions['reasoning']>;
  }
>;

export type GoogleEvaluationModelId = keyof typeof googleEvaluationModels;
