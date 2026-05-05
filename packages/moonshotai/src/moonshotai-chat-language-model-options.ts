import { z } from 'zod/v4';

export const moonshotaiLanguageModelChatOptions = z.object({
  thinking: z
    .object({
      type: z.enum(['enabled', 'disabled']).optional(),
      budgetTokens: z.number().int().min(1024).optional(),
    })
    .optional(),

  reasoningHistory: z.enum(['disabled', 'interleaved', 'preserved']).optional(),
});

export type MoonshotAILanguageModelChatOptions = z.infer<
  typeof moonshotaiLanguageModelChatOptions
>;
