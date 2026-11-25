import {
  lazySchema,
  zodSchema,
  type InferSchema,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';

export const xaiImageModelOptions = lazySchema(() =>
  zodSchema(
    z.object({
      aspect_ratio: z.string().optional(),
      output_format: z.string().optional(),
      sync_mode: z.boolean().optional(),
      resolution: z.enum(['1k', '1.5k', '2k']).optional(),
      quality: z.enum(['low', 'medium', 'high', 'auto']).optional(),
      user: z.string().optional(),
    }),
  ),
);

export type XaiImageModelOptions = InferSchema<typeof xaiImageModelOptions>;
