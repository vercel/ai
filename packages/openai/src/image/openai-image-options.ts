import {
  type InferValidator,
  lazyValidator,
  zodSchema,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';

export type OpenAIImageModelId =
  | 'dall-e-3'
  | 'dall-e-2'
  | 'gpt-image-1'
  | 'gpt-image-1-mini'
  | 'gpt-image-1.5'
  | 'gpt-image-2'
  | (string & {});

// https://platform.openai.com/docs/guides/images
export const modelMaxImagesPerCall: Record<OpenAIImageModelId, number> = {
  'dall-e-3': 1,
  'dall-e-2': 10,
  'gpt-image-1': 10,
  'gpt-image-1-mini': 10,
  'gpt-image-1.5': 10,
  'gpt-image-2': 10,
};

export const hasDefaultResponseFormat = new Set([
  'gpt-image-1',
  'gpt-image-1-mini',
  'gpt-image-1.5',
  'gpt-image-2',
]);

const baseImageModelOptionsObject = z.object({
  /**
   * Quality of the generated image(s).
   *
   * Valid values: `standard`, `hd`, `low`, `medium`, `high`, `auto`.
   */
  quality: z
    .enum(['standard', 'hd', 'low', 'medium', 'high', 'auto'])
    .optional(),

  /**
   * Background behavior for the generated image(s).
   *
   * If `transparent`, the output format must support transparency
   * (i.e. `png` or `webp`).
   */
  background: z.enum(['transparent', 'opaque', 'auto']).optional(),

  /**
   * Format in which the generated image(s) are returned.
   */
  outputFormat: z.enum(['png', 'jpeg', 'webp']).optional(),

  /**
   * Compression level (0-100) for the generated image(s). Applies to the
   * `jpeg` and `webp` output formats.
   */
  outputCompression: z.number().int().min(0).max(100).optional(),

  /**
   * A unique identifier representing your end-user, which can help OpenAI
   * to monitor and detect abuse.
   */
  user: z.string().optional(),
});

export const openaiImageModelOptions = lazyValidator(() =>
  zodSchema(baseImageModelOptionsObject),
);

export type OpenAIImageModelOptions = InferValidator<
  typeof openaiImageModelOptions
>;

export const openaiImageModelGenerationOptions = lazyValidator(() =>
  zodSchema(
    baseImageModelOptionsObject.extend({
      /**
       * Style of the generated image. `vivid` produces hyper-real and
       * dramatic images; `natural` produces more subdued, less hyper-real
       * looking images.
       */
      style: z.enum(['vivid', 'natural']).optional(),

      /**
       * Content moderation level for the generated image(s). `low` applies
       * less restrictive filtering.
       */
      moderation: z.enum(['auto', 'low']).optional(),
    }),
  ),
);

export type OpenAIImageModelGenerationOptions = InferValidator<
  typeof openaiImageModelGenerationOptions
>;
