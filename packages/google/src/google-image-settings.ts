export type GoogleImageModelId =
  // Gemini image models (technically multimodal output language models, use :generateContent API)
  | 'gemini-2.5-flash-image'
  | 'gemini-3-pro-image-preview'
  | 'gemini-3.1-flash-image-preview'
  | (string & {});

export interface GoogleImageSettings {
  /**
   * Override the maximum number of images per call (default 10)
   */
  maxImagesPerCall?: number;
}
