import { z } from 'zod/v4';

// https://api-docs.deepseek.com/quick_start/pricing
export type DeepSeekResponsesModelId =
  | 'deepseek-v4-flash'
  | 'deepseek-v4-pro'
  | (string & {});

export const deepseekLanguageModelResponsesOptions = z.object({
  /**
   * How much the model thinks before answering. Defaults to `high`, and `none`
   * turns thinking off.
   *
   * DeepSeek V4 has three thinking strengths - `low`, `high` and `max`. The
   * API additionally accepts `medium` and `xhigh` for compatibility with other
   * providers and maps both of them to `high`.
   *
   * Note that DeepSeek ignores `temperature` and `topP` while thinking is
   * active.
   *
   * @see https://api-docs.deepseek.com/guides/thinking_mode
   */
  reasoningEffort: z
    .enum(['none', 'low', 'medium', 'high', 'xhigh', 'max'])
    .optional(),

  /**
   * Whether to use strict JSON schema validation for structured outputs.
   * Defaults to `true`.
   */
  strictJsonSchema: z.boolean().optional(),

  /**
   * A stable identifier for your end-user. DeepSeek uses it to isolate rate
   * limits between your users.
   *
   * @see https://api-docs.deepseek.com/quick_start/rate_limit
   */
  user: z.string().optional(),
});

export type DeepSeekLanguageModelResponsesOptions = z.infer<
  typeof deepseekLanguageModelResponsesOptions
>;
