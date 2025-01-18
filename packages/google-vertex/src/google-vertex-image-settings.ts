export type GoogleVertexImageModelId =
  | 'imagen-3.0-generate-001'
  | 'imagen-3.0-fast-generate-001'
  | (string & {});

export interface GoogleVertexImageSettings {
  /**
Override the maximum number of images per call (default 4)
   */
  maxImagesPerCall?: number;

  /**
   * Internal. For test use only. May change without notice.
   */
  _internal?: {
    currentDate?: () => Date;
  };
}
