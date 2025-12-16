export type OpenAIImageModelId =
  | 'dall-e-3'
  | 'dall-e-2'
  | 'gpt-image-1'
  | 'gpt-image-1-mini'
  | 'gpt-image-1.5'
  | 'gpt-image-1.5-2025-12-16'
  | (string & {});

// https://platform.openai.com/docs/guides/images
export const modelMaxImagesPerCall: Record<OpenAIImageModelId, number> = {
  'dall-e-3': 1,
  'dall-e-2': 10,
  'gpt-image-1': 10,
  'gpt-image-1-mini': 10,
  'gpt-image-1.5': 10,
  'gpt-image-1.5-2025-12-16': 10,
};

export const hasDefaultResponseFormat = new Set([
  'gpt-image-1',
  'gpt-image-1-mini',
  'gpt-image-1.5',
  'gpt-image-1.5-2025-12-16',
]);
