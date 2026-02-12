export type OpenAIImageModelId =
  | 'dall-e-3'
  | 'dall-e-2'
  | 'gpt-image-1'
  | 'gpt-image-1-mini'
  | 'gpt-image-1.5'
  | (string & {});

/**
 * Options for OpenAI image generation models.
 * These options can be passed to the provider options for fine-grained control over image generation.
 *
 * @see https://platform.openai.com/docs/guides/images
 */
export interface OpenAIImageModelOptions {
  /**
   * The quality of the image that will be generated.
   * - `standard`: Standard quality (default for dall-e-2)
   * - `low`, `medium`, `high`: Only supported for gpt-image-1 models
   * - `auto`: Automatically determine quality
   * - `hd`: High definition (dall-e-3)
   *
   * @default 'auto'
   */
  quality?: 'standard' | 'low' | 'medium' | 'high' | 'auto' | 'hd';

  /**
   * The style of the generated images.
   * - `vivid`: Hyper-real and dramatic images
   * - `natural`: More natural, less hyper-real looking images
   *
   * Only supported for dall-e-3 and gpt-image-1 models.
   */
  style?: 'vivid' | 'natural';

  /**
   * Allows to set transparency for the background of the generated image(s).
   * - `transparent`: Generate images with transparent backgrounds
   * - `opaque`: Generate images with opaque backgrounds
   * - `auto`: Automatically determine the best background (default)
   *
   * Only supported for gpt-image-1 models.
   * If `transparent`, the output format should be `png` or `webp`.
   */
  background?: 'transparent' | 'opaque' | 'auto';

  /**
   * The format in which the generated images are returned.
   * - `png`: PNG format (default for gpt-image-1)
   * - `jpeg`: JPEG format
   * - `webp`: WebP format
   *
   * Only supported for gpt-image-1 models.
   */
  output_format?: 'png' | 'jpeg' | 'webp';

  /**
   * The compression level (0-100%) for the generated images.
   * Higher values mean better quality but larger file sizes.
   *
   * Only supported for gpt-image-1 models with `webp` or `jpeg` output formats.
   * @default 100
   */
  output_compression?: number;

  /**
   * Input fidelity level for image editing operations.
   * - `high`: Higher fidelity to the input image
   * - `low`: Lower fidelity, more creative freedom
   *
   * Only supported for gpt-image-1 models in edit mode.
   */
  input_fidelity?: 'high' | 'low';

  /**
   * Number of partial images to generate during streaming.
   * Only supported for gpt-image-1 models when streaming is enabled.
   */
  partial_images?: number;

  /**
   * A unique identifier representing your end-user.
   * Can help OpenAI to monitor and detect abuse.
   *
   * @see https://platform.openai.com/docs/guides/safety-best-practices#end-user-ids
   */
  user?: string;
}

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
