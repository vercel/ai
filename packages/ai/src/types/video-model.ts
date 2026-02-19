import {
  Experimental_VideoModelV3 as VideoModelV3,
  SharedV3ProviderMetadata,
} from '@ai-sdk/provider';

/**
 * A video model can be a string (model ID) or a VideoModelV3 object.
 */
export type VideoModel = string | VideoModelV3;

export type VideoModelProviderMetadata = SharedV3ProviderMetadata;
