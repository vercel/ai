import { z } from 'zod/v4';

// https://api-docs.deepseek.com/quick_start/pricing
export type DeepSeekChatModelId =
  | 'deepseek-v4-flash'
  | 'deepseek-v4-pro'
  | 'deepseek-v4-flash-vision-exp'
  // Retired aliases remain assignable through the string escape hatch, but are
  // intentionally omitted from first-class editor suggestions.
  | (string & {});

export const deepseekLanguageModelChatOptions = z.object({
  /**
   * Whether to return log probabilities for generated tokens.
   */
  logprobs: z.boolean().optional(),

  /**
   * Number of most likely tokens to return at each token position.
   *
   * Setting this option automatically enables `logprobs`.
   */
  topLogprobs: z.number().int().min(0).max(20).optional(),

  /**
   * An opaque identifier for the end user. DeepSeek uses this identifier for
   * content-safety tracing and request isolation.
   *
   * Must contain only ASCII letters, numbers, underscores, and hyphens, and
   * must be at most 512 characters long.
   */
  userId: z
    .string()
    .regex(/^[a-zA-Z0-9_-]+$/, 'userId must match /^[a-zA-Z0-9_-]+$/')
    .max(512, 'userId must be at most 512 characters long')
    .optional(),

  /**
   * Type of thinking to use. Defaults to `enabled`.
   */
  thinking: z
    .object({
      // `adaptive` is accepted at runtime for backwards compatibility and
      // mapped to `enabled`, but is intentionally excluded from the exported
      // provider options type.
      type: z.enum(['adaptive', 'enabled', 'disabled']).optional(),
    })
    .optional(),

  /**
   * Controls the thinking strength for DeepSeek V4 reasoning models.
   */
  // `medium` and `xhigh` are accepted at runtime for backwards compatibility
  // and mapped to canonical DeepSeek values, but are intentionally excluded
  // from the exported provider options type.
  reasoningEffort: z.enum(['low', 'medium', 'high', 'xhigh', 'max']).optional(),

  /**
   * Whether to use strict JSON schema validation for structured outputs.
   * Only applies when the serving endpoint supports JSON schema response
   * formats (e.g. Azure). Defaults to `true`.
   */
  strictJsonSchema: z.boolean().optional(),
});

export type DeepSeekLanguageModelChatOptions = {
  /**
   * Whether to return log probabilities for generated tokens.
   */
  logprobs?: boolean;

  /**
   * Number of most likely tokens to return at each token position.
   *
   * Setting this option automatically enables `logprobs`.
   */
  topLogprobs?: number;

  /**
   * An opaque identifier for the end user. DeepSeek uses this identifier for
   * content-safety tracing and request isolation.
   *
   * Must contain only ASCII letters, numbers, underscores, and hyphens, and
   * must be at most 512 characters long.
   */
  userId?: string;

  /**
   * Controls whether thinking mode is enabled. Defaults to `enabled`.
   */
  thinking?: {
    type?: 'enabled' | 'disabled';
  };

  /**
   * Controls the thinking strength for DeepSeek V4 reasoning models.
   */
  reasoningEffort?: 'low' | 'high' | 'max';

  /**
   * Whether to use strict JSON schema validation for structured outputs.
   * Only applies when the serving endpoint supports JSON schema response
   * formats (e.g. Azure). Defaults to `true`.
   */
  strictJsonSchema?: boolean;
};

export const deepseekMessageProviderOptions = z.object({
  /**
   * The name of the participant represented by the message.
   *
   * Supported on system, user, and assistant messages.
   */
  name: z.string().optional(),
});

export type DeepSeekMessageProviderOptions = z.infer<
  typeof deepseekMessageProviderOptions
>;

export const deepseekAssistantMessageProviderOptions =
  deepseekMessageProviderOptions.extend({
    /**
     * Whether the assistant message content is a prefix that DeepSeek should
     * continue. This beta feature is only supported on the final assistant
     * message when using a beta base URL.
     */
    prefix: z.literal(true).optional(),
  });

export type DeepSeekAssistantMessageProviderOptions = z.infer<
  typeof deepseekAssistantMessageProviderOptions
>;
