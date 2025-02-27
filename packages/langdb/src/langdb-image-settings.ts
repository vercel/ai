export type LangDBImageModelId =
  | 'openai/dall-e-2'
  | 'openai/dall-e-3'
  | (string & {});

export interface LangDBImageSettings {
  /**
  Override the maximum number of images per call (default 1)
     */
  maxImagesPerCall?: number;
}
