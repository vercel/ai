import { z } from 'zod/v4';

export type OpenAIImageModelId =
  | 'dall-e-3'
  | 'dall-e-2'
  | 'gpt-image-1'
  | 'gpt-image-1-mini'
  | 'gpt-image-1.5'
  | (string & {});

// https://platform.openai.com/docs/api-reference/images
export const openaiImageModelOptions = z.object({
  quality: z.string().optional(),
  style: z.string().optional(),
  background: z.string().optional(),
  output_format: z.string().optional(),
  output_compression: z.number().optional(),
  input_fidelity: z.string().optional(),
  partial_images: z.number().optional(),
  user: z.string().optional(),
});

export type OpenAIImageModelOptions = z.infer<typeof openaiImageModelOptions>;

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
