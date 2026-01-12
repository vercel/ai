import { z } from 'zod/v4';

// ImageRouter provider options schema
// Based on OpenAI-compatible API: https://docs.imagerouter.io/api-reference/image-generation
export const imagerouterImageProviderOptionsSchema = z
  .object({
    // Quality parameter - not all models support this
    quality: z.enum(['auto', 'low', 'medium', 'high']).optional(),

    // Size parameter for image dimensions (auto or WIDTHxHEIGHT)
    size: z.string().optional(),

    // Response format
    response_format: z.enum(['url', 'b64_json', 'b64_ephemeral']).optional(),

    // Image output format
    output_format: z.enum(['webp', 'jpeg', 'png']).optional(),
  })
  .passthrough(); // Allow additional model-specific parameters

export type ImageRouterImageProviderOptions = z.infer<
  typeof imagerouterImageProviderOptionsSchema
>;
