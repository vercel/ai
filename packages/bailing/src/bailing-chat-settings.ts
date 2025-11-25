import { OpenAICompatibleChatModelId } from '@ai-sdk/openai-compatible';
import { z } from 'zod/v4';

export type BailingChatModelId =
  | 'Ling-1T'
  | 'Ring-1T'
  | (string & {});

// Define the search options schema
export const bailingSearchOptionsSchema = z.object({
  /**
   * Whether to force web search, default is false.
   * When enabled, the model will determine whether to enable web search based on the context.
   */
  forced_search: z.boolean().optional(),
});

export type BailingSearchOptions = z.infer<typeof bailingSearchOptionsSchema>;

// Extend the provider options to include search options
export const bailingProviderOptionsSchema = z.object({
  /**
   * A unique identifier representing your end-user, which can help the provider to
   * monitor and detect abuse.
   */
  user: z.string().optional(),

  /**
   * Reasoning effort for reasoning models. Defaults to `medium`.
   */
  reasoningEffort: z.string().optional(),

  /**
   * Controls the verbosity of the generated text. Defaults to `medium`.
   */
  textVerbosity: z.string().optional(),

  /**
   * Model generation randomness, value range [0.0,1.0], smaller values mean less randomness, default value 1.
   */
  temperature: z.number().min(0.0).max(1.0).optional(),

  /**
   * Model generation diversity, value range (0.0,1.0], smaller values mean less diversity, default value 1.
   */
  top_p: z.number().min(0.0).max(1.0).optional(),

  /**
   * Whether to enable web search, default is disabled.
   * Note: Enabling web search may increase token consumption.
   */
  enable_search: z.boolean().optional(),

  /**
   * Web search strategy.
   */
  search_options: bailingSearchOptionsSchema.optional(),
});

export type BailingProviderOptions = z.infer<typeof bailingProviderOptionsSchema>;

