import type { GoogleModelIds } from './google-model-catalog';

export type GoogleImageModelId = GoogleModelIds['image'] | (string & {});

export interface GoogleImageSettings {
  /**
   * Override the maximum number of images per call (default 1)
   */
  maxImagesPerCall?: number;
}
