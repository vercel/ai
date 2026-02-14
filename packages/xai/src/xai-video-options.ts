import { z } from 'zod/v4';

export const xaiVideoModelOptions = z.object({
  pollIntervalMs: z.number().positive().optional(),
  pollTimeoutMs: z.number().positive().optional(),
  resolution: z.enum(['480p', '720p']).optional(),
});

export type XaiVideoModelOptions = z.infer<typeof xaiVideoModelOptions>;
