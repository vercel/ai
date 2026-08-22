import { z } from 'zod/v4';

// https://api-docs.deepseek.com/quick_start/pricing
export type DeepSeekChatModelId =
  | 'deepseek-v4-flash'
  | 'deepseek-v4-pro'
  | 'deepseek-v4-flash-vision-exp'
  | (string & {});

export const deepseekLanguageModelChatOptions = z.object({
  /**
   * Whether the model thinks before answering. Thinking is enabled by default
   * on the DeepSeek V4 models.
   *
   * `adaptive` lets the model decide per request whether to think. It is
   * accepted by the API alongside `enabled` and `disabled`, but is not covered
   * by https://api-docs.deepseek.com/guides/thinking_mode.
   *
   * Note that DeepSeek ignores `temperature`, `topP`, `presencePenalty` and
   * `frequencyPenalty` while thinking is active.
   */
  thinking: z
    .object({
      type: z.enum(['adaptive', 'enabled', 'disabled']).optional(),
    })
    .optional(),

  /**
   * How much the model thinks before answering. Defaults to `high`.
   *
   * DeepSeek V4 has three thinking strengths - `low`, `high` and `max`. The
   * API additionally accepts `medium` and `xhigh` for compatibility with other
   * providers and maps both of them to `high`.
   *
   * @see https://api-docs.deepseek.com/guides/thinking_mode
   */
  reasoningEffort: z.enum(['low', 'medium', 'high', 'xhigh', 'max']).optional(),

  /**
   * Whether to use strict JSON schema validation for structured outputs.
   * Only applies when the serving endpoint supports JSON schema response
   * formats (e.g. Azure). Defaults to `true`.
   */
  strictJsonSchema: z.boolean().optional(),
});

export type DeepSeekLanguageModelChatOptions = z.infer<
  typeof deepseekLanguageModelChatOptions
>;
