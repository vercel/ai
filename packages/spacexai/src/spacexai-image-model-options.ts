import { z } from 'zod/v4';

export const spacexaiImageModelOptions = z.object({
  aspect_ratio: z.string().optional(),
  output_format: z.string().optional(),
  sync_mode: z.boolean().optional(),
  resolution: z.enum(['1k', '2k']).optional(),
  quality: z.enum(['low', 'medium', 'high']).optional(),
  user: z.string().optional(),
});

export type SpaceXAIImageModelOptions = z.infer<
  typeof spacexaiImageModelOptions
>;
