import { z } from 'zod/v4';

export const openaiCompatibleImageModelOptions = z.object({
  /**
   * Quality of the generated image(s).
   *
   * Common values: `"standard"`, `"hd"` (DALL-E 3), `"low"`, `"medium"`,
   * `"high"`, `"auto"` (gpt-image models).
   */
  quality: z.string().optional(),

  /**
   * Style of the generated image (DALL-E 3 only).
   *
   * - `"vivid"`: produces hyper-real and dramatic images.
   * - `"natural"`: produces more subdued, less hyper-real looking images.
   */
  style: z.enum(['vivid', 'natural']).optional(),

  /**
   * A unique identifier representing your end-user, which can help
   * providers monitor and detect abuse.
   */
  user: z.string().optional(),
});

export type OpenAICompatibleImageModelOptions = z.infer<
  typeof openaiCompatibleImageModelOptions
>;
