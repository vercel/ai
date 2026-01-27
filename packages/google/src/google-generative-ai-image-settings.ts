export type GoogleGenerativeAIImageModelId =
  | 'imagen-4.0-generate-001'
  | 'imagen-4.0-ultra-generate-001'
  | 'imagen-4.0-fast-generate-001'
  | (string & {});

export interface GoogleGenerativeAIImageSettings {
  /**
   * Override the maximum number of images per call (default 4)
   */
  maxImagesPerCall?: number;
}
