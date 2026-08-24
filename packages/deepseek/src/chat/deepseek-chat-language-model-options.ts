import { z } from 'zod/v4';

// https://api-docs.deepseek.com/quick_start/pricing
export type DeepSeekChatModelId =
  | 'deepseek-chat'
  | 'deepseek-reasoner'
  | 'deepseek-v4-flash-vision-exp'
  | (string & {});

export const deepseekLanguageModelChatOptions = z
  .object({
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
    reasoningEffort: z
      .enum(['low', 'medium', 'high', 'xhigh', 'max'])
      .optional(),

    /**
     * Whether to return log probabilities for generated tokens.
     */
    logprobs: z.boolean().optional(),

    /**
     * Number of most likely tokens to return at each token position.
     *
     * Setting this option enables `logprobs` when `logprobs` is omitted.
     */
    topLogprobs: z.number().int().min(0).max(20).optional(),

    /**
     * Whether to use strict JSON schema validation for structured outputs.
     * Only applies when the serving endpoint supports JSON schema response
     * formats (e.g. Azure). Defaults to `true`.
     */
    strictJsonSchema: z.boolean().optional(),
  })
  .superRefine((options, context) => {
    if (options.logprobs === false && options.topLogprobs != null) {
      context.addIssue({
        code: 'custom',
        path: ['topLogprobs'],
        message: 'topLogprobs requires logprobs to be true or omitted',
      });
    }
  });

export type DeepSeekLanguageModelChatOptions = z.infer<
  typeof deepseekLanguageModelChatOptions
>;
