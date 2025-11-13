import {
  ImageModelV3,
  ImageModelV3CallWarning,
  ImageModelV3ProviderMetadata,
} from '@ai-sdk/provider';

/**
Image model that is used by the AI SDK Core functions.
  */
export type ImageModel = ImageModelV3;

/**
Warning from the model provider for this call. The call will proceed, but e.g.
some settings might not be supported, which can lead to suboptimal results.
  */
export type ImageGenerationWarning = ImageModelV3CallWarning;

/**
Metadata from the model provider for this call
  */
export type ImageModelProviderMetadata = ImageModelV3ProviderMetadata;
