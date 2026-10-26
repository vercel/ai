import {
  lazySchema,
  zodSchema,
  type InferSchema,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';

export const minimaxImagePartOptions = lazySchema(() =>
  zodSchema(
    z.object({
      /** Image processing detail for M3.1 and later models. Omit to use the server default. */
      detail: z.enum(['low', 'default', 'high']).optional(),
    }),
  ),
);

export type MiniMaxImagePartOptions = InferSchema<
  typeof minimaxImagePartOptions
>;

export const minimaxVideoPartOptions = lazySchema(() =>
  zodSchema(
    z.object({
      /** Video frame sampling rate for M3.1 and later models, in frames per second. */
      fps: z.number().min(0.2).max(5).optional(),
    }),
  ),
);

export type MiniMaxVideoPartOptions = InferSchema<
  typeof minimaxVideoPartOptions
>;
