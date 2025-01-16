export type VeniceAIImageModelId =
  | 'fluently-xl'
  | 'flux-dev'
  | 'flux-dev-uncensored'
  | 'pony-realism'
  | 'stable-diffusion-3.5'
  | (string & {});

// https://docs.venice.ai/api-reference/endpoint/image/generate
export const modelMaxImagesPerCall: Record<VeniceAIImageModelId, number> = {
  'fluently-xl': 1,
  'flux-dev': 1,
  'flux-dev-uncensored': 1,
  'pony-realism': 1,
  'stable-diffusion-3.5': 1,
};

export interface VeniceImageParameters {
  /**
   * The style preset to use for image generation
   * @example "anime", "photographic", "digital-art", etc.
   */
  style_preset?: string;

  /**
   * Whether to enable safe mode for content filtering
   * @default false
   */
  safe_mode?: boolean;

  /**
   * The number of inference steps to run
   * @default 30
   */
  num_inference_steps?: number;

  /**
   * The guidance scale for image generation
   * @default 7.5
   */
  guidance_scale?: number;

  /**
   * The random seed to use for generation
   */
  seed?: number;

  /**
   * The height of the generated image in pixels
   * @default 1024
   */
  height?: number;

  /**
   * The width of the generated image in pixels
   * @default 1024
   */
  width?: number;
}

export interface VeniceAIImageSettings {
  /**
   * Override the maximum number of images per call (default is dependent on the
   * model, or 1 for an unknown model).
   */
  maxImagesPerCall?: number;

  /**
   * Venice-specific parameters that can be passed to the API
   */
  venice_parameters?: VeniceImageParameters;
}
