import {
  createProviderExecutedToolFactory,
  lazySchema,
  zodSchema,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';

export const imageGenerationArgsSchema = lazySchema(() =>
  zodSchema(
    z
      .object({
        action: z.enum(['generate', 'edit', 'auto']).optional(),
        background: z.enum(['auto', 'opaque', 'transparent']).optional(),
        inputFidelity: z.enum(['low', 'high']).optional(),
        inputImageMask: z
          .object({
            fileId: z.string().optional(),
            imageUrl: z.string().optional(),
          })
          .optional(),
        model: z.string().optional(),
        moderation: z.enum(['auto', 'low']).optional(),
        outputCompression: z.number().int().min(0).max(100).optional(),
        outputFormat: z.enum(['png', 'jpeg', 'webp']).optional(),
        partialImages: z.number().int().min(0).max(3).optional(),
        quality: z.enum(['auto', 'low', 'medium', 'high']).optional(),
        size: z
          .union([
            z.enum(['1024x1024', '1024x1536', '1536x1024', 'auto']),
            z.string().regex(/^\d+x\d+$/),
          ])
          .optional(),
      })
      .strict(),
  ),
);

const imageGenerationInputSchema = lazySchema(() => zodSchema(z.object({})));

export const imageGenerationOutputSchema = lazySchema(() =>
  zodSchema(z.object({ result: z.string() })),
);

type ImageGenerationArgs = {
  /**
   * Whether to generate a new image or edit an existing image. Default: auto.
   */
  action?: 'generate' | 'edit' | 'auto';

  /**
   * Background type for the generated image. Default is 'auto'.
   */
  background?: 'auto' | 'opaque' | 'transparent';

  /**
   * Input fidelity for the generated image. Default is 'low'.
   */
  inputFidelity?: 'low' | 'high';

  /**
   * Optional mask for inpainting.
   * Contains image_url (string, optional) and file_id (string, optional).
   */
  inputImageMask?: {
    /**
     * File ID for the mask image.
     */
    fileId?: string;

    /**
     * Base64-encoded mask image.
     */
    imageUrl?: string;
  };

  /**
   * The image generation model to use. Default: gpt-image-1.
   */
  model?: string;

  /**
   * Moderation level for the generated image. One of auto or low. Default: auto.
   */
  moderation?: 'auto' | 'low';

  /**
   * Compression level for the output image. Default: 100.
   */
  outputCompression?: number;

  /**
   * The output format of the generated image. One of png, webp, or jpeg.
   * Default: png
   */
  outputFormat?: 'png' | 'jpeg' | 'webp';

  /**
   * Number of partial images to generate in streaming mode, from 0 (default value) to 3.
   */
  partialImages?: number;

  /**
   * The quality of the generated image.
   * One of low, medium, high, or auto. Default: auto.
   */
  quality?: 'auto' | 'low' | 'medium' | 'high';

  /**
   * The size of the generated image.
   * One of 1024x1024, 1024x1536, 1536x1024, or auto. gpt-image-2 also accepts
   * arbitrary WIDTHxHEIGHT sizes where both are divisible by 16, e.g. 1536x864.
   * Default: auto.
   */
  size?: 'auto' | '1024x1024' | '1024x1536' | '1536x1024' | (string & {});
};

const imageGenerationToolFactory = createProviderExecutedToolFactory<
  {},
  {
    /**
     * The generated image encoded in base64.
     */
    result: string;
  },
  ImageGenerationArgs
>({
  id: 'openai.image_generation',
  inputSchema: imageGenerationInputSchema,
  outputSchema: imageGenerationOutputSchema,
});

export const imageGeneration = (
  args: ImageGenerationArgs = {}, // default
) => {
  return imageGenerationToolFactory(args);
};
