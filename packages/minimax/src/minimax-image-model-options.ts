import {
  lazySchema,
  zodSchema,
  type InferSchema,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';

export type MiniMaxImageModelId =
  | 'MiniMax-H3-Image'
  | 'MiniMax-H3-Image-Highspeed'
  | (string & {});

export const minimaxImageModelOptionsSchema = lazySchema(() =>
  zodSchema(
    z.object({
      /** Output area when a pixel size is not supplied. Defaults to 4K. */
      area: z.enum(['1K', '2K', '4K']).nullish(),
      /** Disable prompt enhancement for text-to-image requests. */
      disablePromptEnhanced: z.boolean().nullish(),
      /** Compression quality for JPEG and WebP output, from 0 to 100. */
      outputCompression: z.number().int().min(0).max(100).nullish(),
      /** Generated image format. Defaults to JPEG. */
      outputFormat: z.enum(['jpeg', 'jpg', 'png', 'webp']).nullish(),
    }),
  ),
);

export type MiniMaxImageModelOptions = InferSchema<
  typeof minimaxImageModelOptionsSchema
>;
