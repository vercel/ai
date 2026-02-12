export type BedrockImageModelId = 'amazon.nova-canvas-v1:0' | (string & {});

/**
 * Options for Amazon Bedrock image generation models.
 * These options can be passed to the provider options for fine-grained control over image generation.
 *
 * @see https://docs.aws.amazon.com/nova/latest/userguide/image-gen-req-resp-structure.html
 */
export interface AmazonBedrockImageModelOptions {
  /**
   * The quality of the image that will be generated.
   * Higher quality may take longer to generate.
   *
   * Typically `standard` or `premium` depending on the model.
   */
  quality?: string;

  /**
   * CFG (Classifier Free Guidance) scale for image generation.
   * Controls how closely the generated image adheres to the prompt.
   * Higher values mean stricter adherence to the prompt.
   *
   * Typical range: 1.0 to 20.0
   * @default 7.0
   */
  cfgScale?: number;

  /**
   * Negative text prompt to guide what should NOT appear in the generated image.
   * Used to exclude unwanted elements, styles, or characteristics.
   *
   * @example "blurry, low quality, distorted"
   */
  negativeText?: string;

  /**
   * Style preset for the generated image.
   * Different models support different style options.
   *
   * @example "photographic", "digital-art", "cinematic"
   */
  style?: string;

  /**
   * Task type for image operations.
   * Determines the type of image generation or editing to perform.
   *
   * - `TEXT_IMAGE`: Standard text-to-image generation
   * - `INPAINTING`: Edit specific regions of an image (requires mask)
   * - `OUTPAINTING`: Extend an image beyond its original boundaries
   * - `IMAGE_VARIATION`: Generate variations of an existing image
   * - `BACKGROUND_REMOVAL`: Remove background from an image
   */
  taskType?:
    | 'TEXT_IMAGE'
    | 'INPAINTING'
    | 'OUTPAINTING'
    | 'IMAGE_VARIATION'
    | 'BACKGROUND_REMOVAL';

  /**
   * Text prompt describing the mask region for inpainting/outpainting.
   * Alternative to providing an explicit mask image.
   *
   * @example "the background", "the person's face"
   */
  maskPrompt?: string;

  /**
   * Outpainting mode for extending images.
   * Determines how the image should be extended.
   *
   * - `DEFAULT`: Standard outpainting
   * - `PRECISE`: More precise adherence to original image style
   * - `CREATIVE`: More creative freedom in extended areas
   */
  outPaintingMode?: 'DEFAULT' | 'PRECISE' | 'CREATIVE';

  /**
   * Similarity strength for image variation tasks.
   * Controls how similar the generated variation should be to the input image.
   *
   * Range: 0.0 to 1.0
   * - 0.0: Maximum variation, minimal similarity
   * - 1.0: Maximum similarity, minimal variation
   *
   * @default 0.7
   */
  similarityStrength?: number;
}

// https://docs.aws.amazon.com/nova/latest/userguide/image-gen-req-resp-structure.html
export const modelMaxImagesPerCall: Record<BedrockImageModelId, number> = {
  'amazon.nova-canvas-v1:0': 5,
};
