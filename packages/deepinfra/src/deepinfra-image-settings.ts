import { z } from 'zod/v4';

// https://deepinfra.com/models/text-to-image
export type DeepInfraImageModelId =
  | 'stabilityai/sd3.5'
  | 'black-forest-labs/FLUX-1.1-pro'
  | 'black-forest-labs/FLUX-1-schnell'
  | 'black-forest-labs/FLUX-1-dev'
  | 'black-forest-labs/FLUX-pro'
  | 'black-forest-labs/FLUX.1-Kontext-dev'
  | 'black-forest-labs/FLUX.1-Kontext-pro'
  | 'stabilityai/sd3.5-medium'
  | 'stabilityai/sdxl-turbo'
  | (string & {});

/**
 * Provider-specific image model options for DeepInfra.
 *
 * These options are passed through the `providerOptions.deepinfra` parameter
 * when calling image generation functions. Available parameters vary by model;
 * the schema uses `.passthrough()` to allow any additional model-specific fields.
 */
export const deepInfraImageModelOptions = z
  .object({
    /**
     * Classifier-free guidance scale.
     *
     * Higher values mean the image follows the prompt more closely.
     * Supported by FLUX-1-dev, FLUX-1-schnell, and Stable Diffusion models.
     */
    guidance_scale: z.number().optional(),

    /**
     * Number of denoising steps for the image generation process.
     *
     * More steps generally produce higher quality images but take longer.
     * Supported by FLUX-1-dev, FLUX-1-schnell, and Stable Diffusion models.
     */
    num_inference_steps: z.number().int().optional(),

    /**
     * Negative prompt describing what to avoid in the generated image.
     *
     * Supported by Stable Diffusion models.
     */
    negative_prompt: z.string().optional(),

    /**
     * Whether to perform upsampling on the prompt.
     *
     * If active, automatically modifies the prompt for more creative generation.
     * Supported by FLUX-1.1-pro and FLUX-pro models.
     */
    prompt_upsampling: z.boolean().optional(),

    /**
     * Tolerance level for input and output moderation.
     *
     * Between 0 and 6, 0 being most strict, 6 being least strict.
     * Supported by FLUX-1.1-pro and FLUX-pro models.
     */
    safety_tolerance: z.number().int().min(0).max(6).optional(),
  })
  .passthrough();

export type DeepInfraImageModelOptions = z.infer<
  typeof deepInfraImageModelOptions
>;
