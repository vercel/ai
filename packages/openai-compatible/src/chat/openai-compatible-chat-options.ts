import { z } from 'zod/v4';

export type OpenAICompatibleChatModelId = string;

export const openaiCompatibleLanguageModelChatOptions = z.object({
  /**
   * A unique identifier representing your end-user, which can help the provider to
   * monitor and detect abuse.
   */
  user: z.string().optional(),
});

/**
 * Legacy normalized chat options kept for backwards compatibility.
 *
 * Prefer provider-native option names passed through `providerOptions[providerName]`.
 */
export const openaiCompatibleLanguageModelChatLegacyOptions = z.object({
  /**
   * @deprecated Use provider-native request fields for reasoning configuration.
   */
  reasoningEffort: z.string().optional(),

  /**
   * @deprecated Use provider-native request fields for verbosity configuration.
   */
  textVerbosity: z.string().optional(),

  /**
   * @deprecated Use provider-native request fields for schema strictness configuration.
   */
  strictJsonSchema: z.boolean().optional(),
});

export type OpenAICompatibleLanguageModelChatOptions = z.infer<
  typeof openaiCompatibleLanguageModelChatOptions
>;

export type OpenAICompatibleLanguageModelChatLegacyOptions = z.infer<
  typeof openaiCompatibleLanguageModelChatLegacyOptions
>;
