import { z } from 'zod/v4';
import { lazySchema, zodSchema } from '@ai-sdk/provider-utils';

export type OpenAICompatibleVideoModelId = string;

export type OpenAICompatibleVideoModelOptions = {
  /**
   * Polling interval in milliseconds for checking task status.
   * Default: 5000 (5 seconds).
   */
  pollIntervalMs?: number | null;

  /**
   * Maximum time in milliseconds to wait for video generation.
   * Default: 600000 (10 minutes).
   */
  pollTimeoutMs?: number | null;
};

export const openaiCompatibleVideoModelOptionsSchema = lazySchema(() =>
  zodSchema(
    z.looseObject({
      pollIntervalMs: z.number().positive().nullish(),
      pollTimeoutMs: z.number().positive().nullish(),
    }),
  ),
);
