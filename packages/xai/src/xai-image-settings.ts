export type XaiImageModelId = 'grok-2-image' | (string & {});

export interface XaiImageSettings {
  /**
Override the maximum number of images per call. Default is 10.
   */
  maxImagesPerCall?: number;
}
