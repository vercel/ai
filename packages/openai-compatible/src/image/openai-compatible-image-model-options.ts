import { z } from 'zod/v4';

/**
 * Common provider options for OpenAI-compatible image models.
 *
 * Additional provider-specific options are passed through to the API.
 */
export const openaiCompatibleImageModelOptions = z.looseObject({
  /**
   * Dimensions of the generated image.
   *
   * Supported values depend on the provider and model.
   */
  size: z.string().optional(),

  /**
   * Quality of the generated image.
   *
   * Supported values depend on the provider and model.
   */
  quality: z.string().optional(),

  /**
   * File format of the generated image.
   *
   * Supported values depend on the provider and model.
   */
  output_format: z.string().optional(),

  /**
   * Compression level for JPEG and WebP images.
   */
  output_compression: z.number().min(0).max(100).optional(),

  /**
   * Background behavior for the generated image.
   *
   * Supported values depend on the provider and model.
   */
  background: z.string().optional(),
});

export type OpenAICompatibleImageModelOptions = z.infer<
  typeof openaiCompatibleImageModelOptions
>;
