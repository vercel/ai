import { z } from 'zod/v4';

// https://api-docs.deepseek.com/quick_start/pricing
export type DeepSeekChatModelId =
  | 'deepseek-chat'
  | 'deepseek-reasoner'
  | 'deepseek-v4-flash-vision-exp'
  | (string & {});

export const deepseekChatOptions = z.object({
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
   *
   * See https://api-docs.deepseek.com/guides/thinking_mode for the
   * `adaptive` option, which lets the model decide when to think.
   */
  thinking: z
    .object({
      type: z.enum(['adaptive', 'enabled', 'disabled']).optional(),
    })
    .optional(),

  /**
   * Controls the thinking strength for DeepSeek V4 reasoning models.
   *
   * DeepSeek's API accepts `low`, `medium`, `high`, `xhigh`, and `max`.
   * Per their docs, `low` and `medium` are mapped to `high`, and `xhigh`
   * is mapped to `max` server-side for compatibility with other providers.
   */
  reasoningEffort: z.enum(['low', 'medium', 'high', 'xhigh', 'max']).optional(),

  /**
   * Whether to use strict JSON schema validation for structured outputs.
   * Only applies when the serving endpoint supports JSON schema response
   * formats (e.g. Azure). Defaults to `true`.
   */
  strictJsonSchema: z.boolean().optional(),
});

export type DeepSeekChatOptions = z.infer<typeof deepseekChatOptions>;

export const deepseekAssistantMessageProviderOptions = z.object({
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
