import { lazySchema, zodSchema } from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';

/**
 * Aspect ratios supported by the MiniMax-H3 video model.
 */
export const minimaxVideoRatios = [
  'adaptive',
  '21:9',
  '16:9',
  '4:3',
  '1:1',
  '3:4',
  '9:16',
] as const;

/**
 * Output resolutions supported by the MiniMax-H3 video model.
 */
export const minimaxVideoResolutions = ['2K'] as const;

/**
 * Provider options for MiniMax video generation.
 */
export const minimaxVideoProviderOptions = z.object({
  /**
   * Output resolution.
   */
  resolution: z.enum(minimaxVideoResolutions).optional(),

  /**
   * Aspect ratio of the generated video. Overrides the top-level `aspectRatio`.
   */
  ratio: z.enum(minimaxVideoRatios).optional(),

  /**
   * Reference audio URLs for reference-to-video generation.
   */
  referenceAudio: z.array(z.string()).optional(),

  /**
   * Whether to embed an AIGC watermark in the output. Defaults to `false`.
   */
  aigcWatermark: z.boolean().optional(),

  /**
   * Interval in milliseconds between task status polls. Default: 10000.
   */
  pollIntervalMs: z.number().int().positive().optional(),

  /**
   * Maximum time in milliseconds to poll before timing out. Default: 600000.
   */
  pollTimeoutMs: z.number().int().positive().optional(),
});

export type MiniMaxVideoModelOptions = z.infer<
  typeof minimaxVideoProviderOptions
>;

export const minimaxVideoModelOptionsSchema = lazySchema(() =>
  zodSchema(minimaxVideoProviderOptions),
);
