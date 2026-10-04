import type { JSONValue, SharedV4ProviderOptions } from '@ai-sdk/provider';

export type QuiverAILanguageModelOptions = {
  /**
   * Controls the amount of reasoning used by the model.
   */
  reasoningEffort?: 'low' | 'medium' | 'high' | 'xhigh';

  /**
   * Requests the model's safe reasoning summary.
   */
  reasoningSummary?: 'auto';
};

export type QuiverAILanguageModelV4ProviderOptions = {
  quiverai?: QuiverAILanguageModelOptions & Record<string, JSONValue>;
} & SharedV4ProviderOptions;
