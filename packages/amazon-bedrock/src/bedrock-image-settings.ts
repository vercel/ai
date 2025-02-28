export type BedrockImageModelId = 'amazon.nova-canvas-v1:0' | (string & {});

// https://docs.aws.amazon.com/nova/latest/userguide/image-gen-req-resp-structure.html
export const modelMaxImagesPerCall: Record<BedrockImageModelId, number> = {
  'amazon.nova-canvas-v1:0': 5,
};

export interface BedrockImageSettings {
  /**
   * Override the maximum number of images per call (default is dependent on the
   * model, or 1 for an unknown model).
   */
  maxImagesPerCall?: number;
}
