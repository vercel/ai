import { z } from 'zod/v4';

export type BedrockImageModelId = 'amazon.nova-canvas-v1:0' | (string & {});

// https://docs.aws.amazon.com/nova/latest/userguide/image-gen-req-resp-structure.html
export const modelMaxImagesPerCall: Record<BedrockImageModelId, number> = {
  'amazon.nova-canvas-v1:0': 5,
};

/**
 * Provider-specific image model options for Amazon Bedrock (Nova Canvas).
 *
 * These options can be passed in the `providerOptions.bedrock` field of
 * `generateImage` to customize image generation, editing, and variation
 * behavior.
 *
 * @see https://docs.aws.amazon.com/nova/latest/userguide/image-gen-req-resp-structure.html
 */
export const amazonBedrockImageModelOptions = z
  .object({
    /**
     * The quality level for image generation.
     */
    quality: z.enum(['standard', 'premium']).optional(),

    /**
     * Text describing what you don't want in the generated image.
     */
    negativeText: z.string().optional(),

    /**
     * Controls how closely the generated image adheres to the prompt.
     * Higher values result in images more closely aligned to the prompt.
     */
    cfgScale: z.number().optional(),

    /**
     * Predefined visual style for image generation.
     *
     * See the Amazon Bedrock documentation for a current list of supported
     * styles (e.g. `PHOTOREALISM`).
     */
    style: z.string().optional(),

    /**
     * The task type to use for image generation with files.
     * Inferred automatically when not specified:
     * - `INPAINTING` when a mask is provided
     * - `IMAGE_VARIATION` when files are provided without a mask
     */
    taskType: z
      .enum([
        'TEXT_IMAGE',
        'INPAINTING',
        'OUTPAINTING',
        'BACKGROUND_REMOVAL',
        'IMAGE_VARIATION',
      ])
      .optional(),

    /**
     * A text prompt describing the mask area for inpainting or outpainting.
     * Used as an alternative to providing a mask image.
     */
    maskPrompt: z.string().optional(),

    /**
     * The outpainting mode to use.
     */
    outPaintingMode: z.string().optional(),

    /**
     * Controls how similar the generated variation is to the original image(s).
     * Values closer to 1.0 produce images more similar to the input.
     */
    similarityStrength: z.number().optional(),
  })
  .passthrough();

export type AmazonBedrockImageModelOptions = z.infer<
  typeof amazonBedrockImageModelOptions
>;
