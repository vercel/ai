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
 * Options for Deepinfra image generation models.
 * These options can be passed to the provider options for fine-grained control over image generation.
 *
 * @see https://deepinfra.com/models/text-to-image
 */
export interface DeepinfraImageModelOptions {
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
   * @example "blurry, low quality, distorted, watermark"
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
   * Only applicable when editing existing images.
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
   * Image format for the generated output.
   * Controls the file format of the returned image.
   *
   * @default "png"
   */
  image_format?: 'png' | 'jpeg' | 'webp';

  /**
   * Response format for the API.
   * - `url`: Returns a URL to the generated image
   * - `b64_json`: Returns the image as base64-encoded JSON
   *
   * Note: For standard generation, images are always returned as base64 data URIs.
   * This option primarily affects the OpenAI-compatible edit endpoint.
   *
   * @default "b64_json"
   */
  response_format?: 'url' | 'b64_json';
}
