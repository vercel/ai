import { z } from 'zod/v4';

// https://fireworks.ai/models?type=image
export type FireworksImageModelId =
  | 'accounts/fireworks/models/flux-1-dev-fp8'
  | 'accounts/fireworks/models/flux-1-schnell-fp8'
  | 'accounts/fireworks/models/flux-kontext-pro'
  | 'accounts/fireworks/models/flux-kontext-max'
  | 'accounts/fireworks/models/playground-v2-5-1024px-aesthetic'
  | 'accounts/fireworks/models/japanese-stable-diffusion-xl'
  | 'accounts/fireworks/models/playground-v2-1024px-aesthetic'
  | 'accounts/fireworks/models/SSD-1B'
  | 'accounts/fireworks/models/stable-diffusion-xl-1024-v1-0'
  | (string & {});

// https://docs.fireworks.ai/api-reference/generate-a-new-image-from-a-text-prompt
/**
 * Provider-specific image model options for Fireworks FLUX workflow models
 * (e.g. flux-1-dev-fp8, flux-1-schnell-fp8).
 *
 * These options are passed through the `providerOptions.fireworks` parameter
 * when calling image generation functions with FLUX text-to-image models.
 */
export const fireworksFluxImageModelOptions = z
  .object({
    /**
     * Classifier-free guidance scale for the image diffusion process.
     *
     * Default value is 3.5.
     */
    guidance_scale: z.number().optional(),

    /**
     * Number of denoising steps for the image generation process.
     *
     * Default value is 4.
     */
    num_inference_steps: z.number().int().optional(),
  })
  .passthrough();

export type FireworksFluxImageModelOptions = z.infer<
  typeof fireworksFluxImageModelOptions
>;

// https://docs.fireworks.ai/api-reference/generate-or-edit-image-using-flux-kontext
/**
 * Provider-specific image model options for Fireworks Kontext models
 * (e.g. flux-kontext-pro, flux-kontext-max).
 *
 * These options are passed through the `providerOptions.fireworks` parameter
 * when calling image generation functions with Kontext models.
 */
export const fireworksKontextImageModelOptions = z
  .object({
    /**
     * Output format for the generated image.
     *
     * Options: `jpeg`, `png`.
     */
    output_format: z.enum(['jpeg', 'png']).optional(),

    /**
     * Whether to perform upsampling on the prompt.
     *
     * If active, automatically modifies the prompt for more creative generation.
     */
    prompt_upsampling: z.boolean().optional(),

    /**
     * Tolerance level for input and output moderation.
     *
     * Between 0 and 6, 0 being most strict, 6 being least strict.
     * Limit of 2 for Image to Image.
     */
    safety_tolerance: z.number().int().min(0).max(6).optional(),

    /**
     * URL to receive webhook notifications.
     */
    webhook_url: z.string().optional(),

    /**
     * Optional secret for webhook signature verification.
     */
    webhook_secret: z.string().optional(),
  })
  .passthrough();

export type FireworksKontextImageModelOptions = z.infer<
  typeof fireworksKontextImageModelOptions
>;

/**
 * Provider-specific image model options for all Fireworks image models.
 *
 * This is a union of the options for the different Fireworks image model
 * backends. Since different models support different parameters, use the
 * more specific types ({@link FireworksFluxImageModelOptions} or
 * {@link FireworksKontextImageModelOptions}) when you know which model
 * you are targeting.
 *
 * All options use `.passthrough()` so additional model-specific parameters
 * can be included.
 */
export type FireworksImageModelOptions =
  | FireworksFluxImageModelOptions
  | FireworksKontextImageModelOptions;
