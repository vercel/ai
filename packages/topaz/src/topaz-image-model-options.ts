import { z } from 'zod/v4';

/**
 * Provider options for Topaz generative image models (Wonder 3.5).
 *
 * The documented request schema fields are sent in snake_case
 * (`output_width`, `output_format`, ...); model-specific settings are sent in
 * camelCase, matching the Topaz model reference.
 *
 * @see https://developer.topazlabs.com/image-models/wonder/wonder-3.5-new
 */
export const topazImageModelOptionsSchema = z.object({
  /**
   * How aggressively the model enhances the image. Defaults to `high`.
   */
  enhancementStrength: z.enum(['low', 'medium', 'high']).optional(),

  /**
   * Whether to add grain to the output. Defaults to `false`.
   */
  grain: z.boolean().optional(),

  /**
   * Grain intensity, 0.0 to 1.0. Defaults to 0.5.
   */
  grainDensity: z.number().min(0).max(1).optional(),

  /**
   * Grain model. Defaults to `silver`.
   */
  grainModel: z.enum(['silver', 'gaussian', 'grey']).optional(),

  /**
   * Grain particle size, 1 to 5. Defaults to 1.
   */
  grainSize: z.number().min(1).max(5).optional(),

  /**
   * Grain effect strength, 0.0 to 1.0. Defaults to 0.5.
   */
  grainStrength: z.number().min(0).max(1).optional(),

  /**
   * Width of the input image in pixels. Topaz infers this from the upload when
   * omitted.
   */
  inputWidth: z.number().int().positive().optional(),

  /**
   * Height of the input image in pixels. Topaz infers this from the upload
   * when omitted.
   */
  inputHeight: z.number().int().positive().optional(),

  /**
   * Width of the output image in pixels, 1 to 32000. Takes precedence over the
   * width derived from the `size` call option.
   */
  outputWidth: z.number().int().min(1).max(32000).optional(),

  /**
   * Height of the output image in pixels, 1 to 32000. Takes precedence over
   * the height derived from the `size` call option.
   */
  outputHeight: z.number().int().min(1).max(32000).optional(),

  /**
   * Output image format. Defaults to the Topaz API default.
   */
  outputFormat: z.enum(['jpeg', 'jpg', 'png', 'tiff', 'tif']).optional(),

  /**
   * Whether to crop the output to fill the requested dimensions. Defaults to
   * `false`.
   */
  cropToFill: z.boolean().optional(),

  /**
   * URL to receive job-status webhooks.
   */
  webhookUrl: z.string().optional(),

  /**
   * How often to poll the Topaz status endpoint, in milliseconds. Defaults to
   * 2000.
   */
  pollIntervalMillis: z.number().int().positive().optional(),

  /**
   * How long to wait for the job to finish before failing, in milliseconds.
   * Defaults to 600000 (10 minutes).
   */
  pollTimeoutMillis: z.number().int().positive().optional(),
});

export type TopazImageModelOptions = z.infer<
  typeof topazImageModelOptionsSchema
>;
