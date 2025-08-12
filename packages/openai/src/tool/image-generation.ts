import { createProviderDefinedToolFactory } from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';

export const imageGenerationArgsSchema = z
  .object({
    background: z.enum(['auto', 'opaque', 'transparent']).optional(),
    size: z
      .union([z.literal('auto'), z.string().regex(/^\d+x\d+$/)])
      .optional(),
    quality: z.enum(['auto', 'low', 'medium', 'high']).optional(),
    moderation: z.enum(['auto']).optional(),
    outputFormat: z.enum(['png', 'jpeg', 'webp']).optional(),
    outputCompression: z.number().int().min(0).max(100).optional(),
    n: z.number().int().min(1).max(4).optional(),
  })
  .strict();

export const generateImage = createProviderDefinedToolFactory<
  {},
  {
    background?: 'auto' | 'opaque' | 'transparent';
    size?: 'auto' | `${number}x${number}` | string;
    quality?: 'auto' | 'low' | 'medium' | 'high';
    moderation?: 'auto';
    outputFormat?: 'png' | 'jpeg' | 'webp';
    outputCompression?: number;
    n?: number;
  }
>({
  id: 'openai.image_generation',
  name: 'image_generation',
  inputSchema: z.object({}),
});
