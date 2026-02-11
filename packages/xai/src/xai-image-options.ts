import { z } from 'zod/v4';

export const xaiImageProviderOptions = z.object({
  aspect_ratio: z.string().optional(),
  output_format: z.string().optional(),
  sync_mode: z.boolean().optional(),
});

export type XaiImageProviderOptions = z.infer<typeof xaiImageProviderOptions>;
