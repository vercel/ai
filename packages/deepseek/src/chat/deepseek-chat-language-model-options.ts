import { z } from 'zod/v4';

// https://api-docs.deepseek.com/quick_start/pricing
export type DeepSeekChatModelId =
  | 'deepseek-chat'
  | 'deepseek-reasoner'
  | (string & {});

export const deepseekLanguageModelChatOptions = z.object({
  /**
   * Type of thinking to use. Defaults to `enabled`.
   */
  thinking: z
    .object({
      type: z.enum(['enabled', 'disabled']).optional(),
    })
    .optional(),

  /**
   * Controls the thinking strength for DeepSeek V4 reasoning models.
   */
  reasoningEffort: z.enum(['high', 'max']).optional(),
});

export type DeepSeekLanguageModelChatOptions = z.infer<
  typeof deepseekLanguageModelChatOptions
>;
