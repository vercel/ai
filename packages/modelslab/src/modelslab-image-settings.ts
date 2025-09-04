export type ModelslabImageModelId = 'realtime-text2img';

export interface ModelslabImageSettings {
  /**
   * The text prompt that describes what you want in the generated image.
   */
  prompt: string;

  /**
   * Negative prompts describe things you don't want in the image.
   * Examples include NSFW content, extra limbs, distorted faces, poor quality, etc.
   */
  negativePrompt?: string;

  /**
   * Width of the generated image.
   * @default 512
   */
  width?: number;

  /**
   * Height of the generated image.
   * @default 512
   */
  height?: number;

  /**
   * Number of sample images to be returned in response.
   * Maximum value is 4.
   * @default 1
   */
  samples?: number;

  /**
   * NSFW image checker ensures inappropriate content is replaced with blank image.
   * @default true
   */
  safetyChecker?: boolean;

  /**
   * Seed used to reproduce results. Use null for random seed.
   * @default null
   */
  seed?: number | null;

  /**
   * Enable instant response before processing finishes.
   * @default false
   */
  instantResponse?: boolean;

  /**
   * Get response as base64 string.
   * @default false
   */
  base64?: boolean;

  /**
   * URL to receive POST API call after image generation completes.
   */
  webhook?: string | null;

  /**
   * Track ID returned in webhook response for identification.
   */
  trackId?: string | null;

  /**
   * Enhance prompts for better results.
   * @default false
   */
  enhancePrompt?: boolean;
}
