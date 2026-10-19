import { z } from 'zod/v4';

export const minimaxImagePartOptions = z.object({
  /** Image processing detail for M3.1 Flash. Omit to use the server default. */
  detail: z.enum(['low', 'default', 'high']).optional(),
});

export type MiniMaxImagePartOptions = z.infer<typeof minimaxImagePartOptions>;

export const minimaxVideoPartOptions = z.object({
  /** Video frame sampling rate for M3.1 Flash, in frames per second. */
  fps: z.number().min(0.2).max(5).optional(),
});

export type MiniMaxVideoPartOptions = z.infer<typeof minimaxVideoPartOptions>;
