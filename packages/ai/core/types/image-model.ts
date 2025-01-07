import { ImageModelV1, ImageModelV1CallWarning } from '@ai-sdk/provider';

/**
  Image model that is used by the AI SDK Core functions.
  */
export type ImageModel = ImageModelV1;

/**
  Warning from the model provider for this call. The call will proceed, but e.g.
  some settings might not be supported, which can lead to suboptimal results.
  */
export type ImageModelCallWarning = ImageModelV1CallWarning;
