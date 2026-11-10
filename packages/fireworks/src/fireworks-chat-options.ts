import { z } from 'zod/v4';
import type { FireworksModelIds } from './fireworks-model-catalog';

// https://docs.fireworks.ai/docs/serverless-models#chat-models
// Below is just a subset of the available models.
export type FireworksChatModelId = FireworksModelIds['chat'] | (string & {});

export const fireworksLanguageModelOptions = z.object({
  /**
   * A stable key for routing requests with shared prompt prefixes to the same
   * prompt cache.
   */
  promptCacheKey: z.string().optional(),

  /**
   * Use Fireworks Priority serving path for higher reliability during peak traffic.
   */
  serviceTier: z.enum(['priority']).optional(),

  thinking: z
    .object({
      type: z.enum(['enabled', 'disabled']).optional(),
      budgetTokens: z.number().int().min(1024).optional(),
    })
    .optional(),

  reasoningHistory: z.enum(['disabled', 'interleaved', 'preserved']).optional(),
});

export type FireworksLanguageModelOptions = z.infer<
  typeof fireworksLanguageModelOptions
>;
