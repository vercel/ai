import {
  lazySchema,
  zodSchema,
  type InferSchema,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';

/**
 * Aspect ratios supported by the MiniMax image generation API.
 */
export const minimaxImageAspectRatios = [
  '1:1',
  '16:9',
  '4:3',
  '3:2',
  '2:3',
  '3:4',
  '9:16',
  '21:9',
] as const;

/**
 * Provider options for MiniMax image generation.
 */
export const minimaxImageProviderOptions = z.object({
  /**
   * Format of the generated images. Defaults to `url`.
   */
  responseFormat: z.enum(['url', 'base64']).optional(),

  /**
   * Whether to enable automatic optimization of the prompt. Defaults to `false`.
   */
  promptOptimizer: z.boolean().optional(),
});

export type MiniMaxImageModelOptions = z.infer<
  typeof minimaxImageProviderOptions
>;

export const minimaxImageModelOptionsSchema = lazySchema(() =>
  zodSchema(minimaxImageProviderOptions),
);

export type { InferSchema };
