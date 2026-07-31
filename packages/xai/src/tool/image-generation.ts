import {
  createProviderExecutedToolFactory,
  lazySchema,
  zodSchema,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';

/**
 * Schema for image generation tool arguments.
 * @see https://docs.x.ai/developers/tools/overview
 */
export const imageGenerationArgsSchema = lazySchema(() =>
  zodSchema(
    z.object({
      action: z.enum(['auto', 'generate', 'edit']).optional(),
    }),
  ),
);

const imageGenerationInputSchema = lazySchema(() => zodSchema(z.object({})));

const imageGenerationOutputSchema = lazySchema(() =>
  zodSchema(
    z.object({
      result: z.string(),
      prompt: z.string().optional(),
    }),
  ),
);

const imageGenerationToolFactory = createProviderExecutedToolFactory<
  {},
  {
    /**
     * The generated image encoded in base64.
     */
    result: string;

    /**
     * The prompt that the model wrote for the image model.
     */
    prompt?: string;
  },
  {
    /**
     * Restricts what the tool can do. Defaults to 'auto'.
     *
     * - 'auto': the model can generate and edit images.
     * - 'generate': text-to-image generation only.
     * - 'edit': image editing only.
     */
    action?: 'auto' | 'generate' | 'edit';
  }
>({
  id: 'xai.image_generation',
  inputSchema: imageGenerationInputSchema,
  outputSchema: imageGenerationOutputSchema,
});

export const imageGeneration = (
  args: Parameters<typeof imageGenerationToolFactory>[0] = {},
) => imageGenerationToolFactory(args);
