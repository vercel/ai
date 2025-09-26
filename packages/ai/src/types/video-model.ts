import {
  VideoModelV2,
  VideoModelV2CallWarning,
  VideoModelV2ProviderMetadata,
} from '@ai-sdk/provider';

/**
Video model that is used by the AI SDK Core functions.
 */
export type VideoModel = VideoModelV2;

/**
Warning from the model provider for this call. The call will proceed, but e.g.
some settings might not be supported, which can lead to suboptimal results.
 */
export type VideoGenerationWarning = VideoModelV2CallWarning;

/**
Metadata from the model provider for this call
 */
export type VideoModelProviderMetadata = VideoModelV2ProviderMetadata;


