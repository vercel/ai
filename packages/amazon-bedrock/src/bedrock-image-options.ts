import { z } from 'zod/v4';

export type BedrockImageModelId = 'amazon.nova-canvas-v1:0' | (string & {});

// https://docs.aws.amazon.com/nova/latest/userguide/image-gen-req-resp-structure.html
export const modelMaxImagesPerCall: Record<BedrockImageModelId, number> = {
  'amazon.nova-canvas-v1:0': 5,
};

/**
 * Provider-specific image model options for Amazon Bedrock.
 *
 * These options are passed through the `providerOptions.bedrock` parameter
 * when calling image generation functions.
 */
export const amazonBedrockImageModelOptions = z
  .object({
    /**
     * Task type for image operations.
     *
     * - `TEXT_IMAGE`: Generate images from text prompts
     * - `IMAGE_VARIATION`: Create variations of existing images
     * - `INPAINTING`: Fill in masked areas of an image
     * - `OUTPAINTING`: Extend an image beyond its original boundaries
     * - `BACKGROUND_REMOVAL`: Remove background from an image
     */
    taskType: z
      .enum([
        'TEXT_IMAGE',
        'IMAGE_VARIATION',
        'INPAINTING',
        'OUTPAINTING',
        'BACKGROUND_REMOVAL',
      ])
      .optional(),

    /**
     * Image quality setting.
     *
     * Higher quality may take longer to generate.
     */
    quality: z.enum(['standard', 'premium']).optional(),

    /**
     * CFG (Classifier Free Guidance) scale.
     *
     * Controls how closely the generated image follows the prompt.
     * Higher values mean stricter adherence to the prompt.
     */
    cfgScale: z.number().optional(),

    /**
     * Negative text prompt.
     *
     * Describes what you don't want to see in the generated image.
     */
    negativeText: z.string().optional(),

    /**
     * Style for the generated image.
     *
     * Only applicable for text-to-image generation.
     */
    style: z.string().optional(),

    /**
     * Mask prompt for inpainting and outpainting operations.
     *
     * Describes the area to be modified when a mask image is not provided.
     */
    maskPrompt: z.string().optional(),

    /**
     * Outpainting mode.
     *
     * Specifies how the image should be extended beyond its original boundaries.
     */
    outPaintingMode: z.enum(['DEFAULT', 'PRECISE']).optional(),

    /**
     * Similarity strength for image variation tasks.
     *
     * Controls how similar the generated variations are to the source image(s).
     * Range: 0.0 (very different) to 1.0 (very similar).
     */
    similarityStrength: z.number().min(0).max(1).optional(),
  })
  .passthrough();

export type AmazonBedrockImageModelOptions = z.infer<
  typeof amazonBedrockImageModelOptions
>;
