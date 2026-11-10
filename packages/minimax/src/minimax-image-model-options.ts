import { lazySchema, zodSchema } from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';

export const minimaxImageProviderOptions = () =>
  z.object({
    /**
     * Aspect ratio of the generated image. Overrides the top-level `aspectRatio`.
     * Cannot be combined with `size` as `{width}x{height}`.
     */
    aspectRatio: z
      .enum(['1:1', '4:3', '3:4', '16:9', '9:16', '3:1', '1:3', 'auto'])
      .optional(),

    /**
     * Output area. The API defaults to `4K` when `size` is omitted.
     * Cannot be combined with `size` as `{width}x{height}`.
     */
    area: z.enum(['1K', '2K', '4K']).optional(),
  });

export type MiniMaxImageModelOptions = z.infer<
  ReturnType<typeof minimaxImageProviderOptions>
>;

export const minimaxImageModelOptionsSchema = lazySchema(() =>
  zodSchema(minimaxImageProviderOptions()),
);
