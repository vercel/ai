import type { LanguageModelV4CallOptions } from '@ai-sdk/provider';

/** Explicit evaluation support. Add each new model with its lowest supported effort. */
export const anthropicEvaluationModels = {
  'claude-haiku-4-5': { reasoningEffort: 'none' },
  'claude-haiku-4-5-20251001': { reasoningEffort: 'none' },
  'claude-sonnet-4-5': { reasoningEffort: 'none' },
  'claude-sonnet-4-5-20250929': { reasoningEffort: 'none' },
  'claude-sonnet-4-6': { reasoningEffort: 'none' },
  'claude-sonnet-5': { reasoningEffort: 'none' },
  'claude-opus-4-5': { reasoningEffort: 'none' },
  'claude-opus-4-5-20251101': { reasoningEffort: 'none' },
  'claude-opus-4-6': { reasoningEffort: 'none' },
  'claude-opus-4-7': { reasoningEffort: 'none' },
  'claude-opus-4-8': { reasoningEffort: 'none' },
  'claude-opus-5': { reasoningEffort: 'none' },
  'claude-fable-5': { reasoningEffort: 'low' },
  'claude-fable-5-1': { reasoningEffort: 'low' },
  'claude-mythos-preview': { reasoningEffort: 'low' },
  'claude-mythos-5': { reasoningEffort: 'low' },
  'claude-mythos-5-1': { reasoningEffort: 'low' },
} as const satisfies Record<
  string,
  {
    reasoningEffort: NonNullable<LanguageModelV4CallOptions['reasoning']>;
  }
>;

export type AnthropicEvaluationModelId = keyof typeof anthropicEvaluationModels;
