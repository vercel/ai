import { z } from 'zod/v4';

export const zaiLanguageModelChatOptions = z.object({
  /**
   * Enables or disables sampling. When disabled, temperature and topP do not
   * take effect.
   */
  doSample: z.boolean().optional(),

  /**
   * Controls model thinking and whether reasoning from earlier turns is kept.
   */
  thinking: z
    .object({
      type: z.enum(['enabled', 'disabled']).optional(),
      clearThinking: z.boolean().optional(),
    })
    .optional(),

  /**
   * Controls reasoning effort for GLM-5.2 and later models.
   */
  reasoningEffort: z
    .enum(['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'])
    .optional(),

  /**
   * Enables incremental function-call argument streaming on supported models.
   */
  toolStream: z.boolean().optional(),

  /**
   * A caller-provided request identifier between 6 and 64 characters.
   */
  requestId: z.string().min(6).max(64).optional(),

  /**
   * A non-sensitive end-user identifier between 6 and 128 characters.
   */
  userId: z.string().min(6).max(128).optional(),
});

export type ZaiLanguageModelChatOptions = z.infer<
  typeof zaiLanguageModelChatOptions
>;
