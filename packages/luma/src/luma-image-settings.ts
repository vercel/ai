// https://luma.ai/models?type=image
export type LumaImageModelId = 'photon-1' | 'photon-flash-1' | (string & {});

export interface LumaImageSettings {
  /**
Override the maximum number of images per call (default 1)
   */
  maxImagesPerCall?: number;
}
