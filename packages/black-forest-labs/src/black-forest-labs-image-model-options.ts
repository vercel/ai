import {
  lazySchema,
  zodSchema,
  type InferSchema,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';

const blackForestLabsImageProviderOptions = z.object({
  resolution: z.enum(['768sq', '1k', '1.5k', '2k', '4k']).optional(),
  grounding: z.boolean().optional(),
  version: z.literal('latest').optional(),
  imagePrompt: z.string().optional(),
  imagePromptStrength: z.number().min(0).max(1).optional(),
  /** @deprecated use prompt.images instead */
  inputImage: z.string().optional(),
  /** @deprecated use prompt.images instead */
  inputImage2: z.string().optional(),
  /** @deprecated use prompt.images instead */
  inputImage3: z.string().optional(),
  /** @deprecated use prompt.images instead */
  inputImage4: z.string().optional(),
  /** @deprecated use prompt.images instead */
  inputImage5: z.string().optional(),
  /** @deprecated use prompt.images instead */
  inputImage6: z.string().optional(),
  /** @deprecated use prompt.images instead */
  inputImage7: z.string().optional(),
  /** @deprecated use prompt.images instead */
  inputImage8: z.string().optional(),
  /** @deprecated use prompt.images instead */
  inputImage9: z.string().optional(),
  /** @deprecated use prompt.images instead */
  inputImage10: z.string().optional(),
  steps: z.number().int().positive().optional(),
  guidance: z.number().min(0).optional(),
  width: z.number().int().min(256).max(1920).optional(),
  height: z.number().int().min(256).max(1920).optional(),
  outputFormat: z.enum(['jpeg', 'png']).optional(),
  promptUpsampling: z.boolean().optional(),
  raw: z.boolean().optional(),
  safetyTolerance: z.number().int().min(0).max(6).optional(),
  webhookSecret: z.string().optional(),
  webhookUrl: z.url().optional(),
  pollIntervalMillis: z.number().int().positive().optional(),
  pollTimeoutMillis: z.number().int().positive().optional(),
});

export const blackForestLabsImageModelOptionsSchema = lazySchema(() =>
  zodSchema(blackForestLabsImageProviderOptions),
);

export const blackForestLabsFlux3ImageModelOptionsSchema = lazySchema(() =>
  zodSchema(
    blackForestLabsImageProviderOptions.extend({
      safetyTolerance: z.number().int().min(0).max(7).optional(),
    }),
  ),
);

export const blackForestLabsLatestImageModelOptionsSchema = lazySchema(() =>
  zodSchema(
    blackForestLabsImageProviderOptions
      .extend({
        width: z.number().int().min(64).max(6256).optional(),
        height: z.number().int().min(64).max(6256).optional(),
        steps: z.number().int().min(1).max(16).optional(),
        safetyTolerance: z.number().int().min(0).max(7).optional(),
      })
      .refine(({ width, height }) => (width == null) === (height == null), {
        message: 'width and height must be provided together',
      })
      .refine(
        ({ width, height }) =>
          width == null || height == null || width * height <= 16822272,
        { message: 'width × height must not exceed 16822272 pixels' },
      ),
  ),
);

export type BlackForestLabsImageModelOptions = InferSchema<
  typeof blackForestLabsImageModelOptionsSchema
>;
