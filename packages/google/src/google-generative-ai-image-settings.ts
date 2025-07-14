export type GoogleGenerativeAIImageModelId =
  | 'imagen-3.0-generate-002'
  | (string & {});

export interface GoogleGenerativeAIImageSettings {
  /**
Override the maximum number of images per call (default 4)
   */
  maxImagesPerCall?: number;
}
