export type OpenAICompatibleImageModelId = string;

export interface OpenAICompatibleImageSettings {
  /**
Override the maximum number of images per call. Default is 10.
   */
  maxImagesPerCall?: number;
}
