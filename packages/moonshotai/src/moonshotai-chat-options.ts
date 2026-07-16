import { z } from 'zod/v4';

export type MoonshotAIChatModelId =
  | 'moonshot-v1-8k'
  | 'moonshot-v1-32k'
  | 'moonshot-v1-128k'
  | 'kimi-k2'
  | 'kimi-k2-0905'
  | 'kimi-k2-thinking'
  | 'kimi-k2-thinking-turbo'
  | 'kimi-k2-turbo'
  | 'kimi-k2.5'
<<<<<<< HEAD
=======
  | 'kimi-k2.6'
  | 'kimi-k2.7-code'
  | 'kimi-k2.7-code-highspeed'
  | 'kimi-k3'
>>>>>>> 341616a326 (feat: add kimi-k3 model and `reasoningEffort` provider option (#17394))
  | (string & {});

export const moonshotaiLanguageModelOptions = z.object({
  /**
   * Reasoning effort for Kimi K3. Currently, only `max` is supported.
   */
  reasoningEffort: z.literal('max').optional(),

  thinking: z
    .object({
      type: z.enum(['enabled', 'disabled']).optional(),
      budgetTokens: z.number().int().min(1024).optional(),
    })
    .optional(),

  reasoningHistory: z.enum(['disabled', 'interleaved', 'preserved']).optional(),
});

export type MoonshotAILanguageModelOptions = z.infer<
  typeof moonshotaiLanguageModelOptions
>;
