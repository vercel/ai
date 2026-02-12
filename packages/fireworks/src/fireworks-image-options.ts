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

/**
 * Options for Fireworks image generation models.
 * These options can be passed to the provider options for fine-grained control over image generation.
 *
 * @see https://fireworks.ai/models?type=image
 */
export interface FireworksImageModelOptions {
  /**
   * Guidance scale for image generation.
   * Controls how closely the generated image adheres to the prompt.
   * Higher values mean stricter adherence to the prompt.
   *
   * Typical range: 1.0 to 20.0
   * @default 7.5
   */
  guidance_scale?: number;

  /**
   * Number of inference steps for image generation.
   * More steps generally produce higher quality images but take longer.
   *
   * Typical range: 20 to 150
   * @default 50
   */
  num_inference_steps?: number;

  /**
   * Negative prompt to guide what should NOT appear in the generated image.
   * Used to exclude unwanted elements, styles, or characteristics.
   *
   * @example "blurry, low quality, distorted"
   */
  negative_prompt?: string;

  /**
   * Strength of the image edit transformation when using input images.
   * Controls how much the output differs from the input image.
   *
   * Range: 0.0 to 1.0
   * - 0.0: Output closely matches input
   * - 1.0: Maximum deviation from input
   *
   * @default 0.8
   */
  strength?: number;

  /**
   * Scheduler/sampler algorithm to use for the diffusion process.
   * Different schedulers can affect image quality and generation speed.
   *
   * @example "DPMSolverMultistep", "DDIM", "PNDM", "EulerAncestralDiscrete"
   */
  scheduler?: string;

  /**
   * Safety checker configuration.
   * Controls whether to apply content safety filtering.
   *
   * @default true
   */
  safety_checker?: boolean;
}
