import { z } from 'zod/v4';

export type OpenAIImageModelId =
  | 'dall-e-3'
  | 'dall-e-2'
  | 'gpt-image-1'
  | 'gpt-image-1-mini'
  | 'gpt-image-1.5'
  | (string & {});

// https://platform.openai.com/docs/guides/images
export const modelMaxImagesPerCall: Record<OpenAIImageModelId, number> = {
  'dall-e-3': 1,
  'dall-e-2': 10,
  'gpt-image-1': 10,
  'gpt-image-1-mini': 10,
  'gpt-image-1.5': 10,
};

const defaultResponseFormatPrefixes = [
  'gpt-image-1-mini',
  'gpt-image-1.5',
  'gpt-image-1',
];

export function hasDefaultResponseFormat(modelId: string): boolean {
  return defaultResponseFormatPrefixes.some(prefix =>
    modelId.startsWith(prefix),
  );
}

/**
 * Provider-specific image model options for OpenAI.
 *
 * These options are passed through the `providerOptions.openai` parameter
 * when calling image generation functions.
 */
export const openAIImageModelOptions = z
  .object({
    /**
     * The quality of the image that will be generated.
     *
     * - `standard`: Standard quality (DALL-E 2 & 3)
     * - `hd`: High-definition quality (DALL-E 3 only)
     * - `low`, `medium`, `high`: Quality levels (gpt-image-1 only)
     * - `auto`: Let the model choose (default for gpt-image-1)
     */
    quality: z
      .enum(['standard', 'hd', 'low', 'medium', 'high', 'auto'])
      .optional(),

    /**
     * The style of the generated images.
     *
     * - `vivid`: Hyper-real and dramatic images (default for DALL-E 3)
     * - `natural`: More natural, less hyper-real looking images
     *
     * Only supported for DALL-E 3.
     */
    style: z.enum(['vivid', 'natural']).optional(),

    /**
     * Background transparency setting.
     *
     * - `transparent`: Generate images with transparent backgrounds
     * - `opaque`: Generate images with opaque backgrounds
     * - `auto`: Let the model decide (default)
     *
     * Only supported for gpt-image-1. When using `transparent`, the output
     * format should be set to `png` (default) or `webp`.
     */
    background: z.enum(['transparent', 'opaque', 'auto']).optional(),

    /**
     * The format in which the generated images are returned.
     *
     * - `png`: PNG format (default for gpt-image-1)
     * - `jpeg`: JPEG format
     * - `webp`: WebP format
     *
     * Only supported for gpt-image-1.
     */
    output_format: z.enum(['png', 'jpeg', 'webp']).optional(),

    /**
     * The compression level (0-100%) for the generated images.
     *
     * Only supported for gpt-image-1 with `webp` or `jpeg` output formats.
     * Defaults to 100.
     */
    output_compression: z.number().min(0).max(100).optional(),

    /**
     * Input fidelity level for image editing operations.
     *
     * - `high`: Higher fidelity to the input image
     * - `low`: Lower fidelity, more creative freedom
     *
     * Only supported for gpt-image-1.
     */
    input_fidelity: z.enum(['high', 'low']).optional(),

    /**
     * The format in which the generated images are returned.
     *
     * - `url`: Return URLs to the generated images (valid for 60 minutes)
     * - `b64_json`: Return base64-encoded JSON
     *
     * Only supported for DALL-E 2. gpt-image-1 always returns base64-encoded images.
     */
    response_format: z.enum(['url', 'b64_json']).optional(),

    /**
     * Edit the image in streaming mode.
     *
     * Defaults to false. Only supported for certain models.
     * See the OpenAI Image generation guide for more information.
     */
    stream: z.boolean().optional(),

    /**
     * A unique identifier representing your end-user.
     *
     * This can help OpenAI to monitor and detect abuse.
     */
    user: z.string().optional(),

    /**
     * Number of partial images to return during streaming.
     *
     * Only applicable when stream is enabled.
     */
    partial_images: z.number().optional(),
  })
  .passthrough();

export type OpenAIImageModelOptions = z.infer<typeof openAIImageModelOptions>;
