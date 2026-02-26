export type GoogleGenerativeAIImageModelId =
  | 'imagen-4.0-generate-001'
  | 'imagen-4.0-ultra-generate-001'
  | 'imagen-4.0-fast-generate-001'
<<<<<<< HEAD
=======
  // Gemini image models (technically multimodal output language models, use :generateContent API)
  | 'gemini-2.5-flash-image'
  | 'gemini-3-pro-image-preview'
  | 'gemini-3.1-flash-image-preview'
>>>>>>> 45f0a7ffd (feat(provider/google): add support for gemini-3.1-flash-image-preview (#12883))
  | (string & {});

export interface GoogleGenerativeAIImageSettings {
  /**
Override the maximum number of images per call (default 4)
   */
  maxImagesPerCall?: number;
}
