export type OpenAIImageModelId =
  | 'gpt-image-1'
  | 'dall-e-3'
  | 'dall-e-2'
  | (string & {});

// https://platform.openai.com/docs/guides/images
export const modelMaxImagesPerCall: Record<OpenAIImageModelId, number> = {
  'dall-e-3': 1,
  'dall-e-2': 10,
  'gpt-image-1': 10,
};

export const hasDefaultResponseFormat = new Set(['gpt-image-1']);

export interface OpenAIImageSettings {
  /**
Override the maximum number of images per call (default is dependent on the
model, or 1 for an unknown model).
   */
  maxImagesPerCall?: number;
}
