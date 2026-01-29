import {
  Experimental_VideoModelV3,
  Experimental_VideoModelV3ProviderMetadata,
} from '@ai-sdk/provider';

/**
 * A video model can be a string (model ID) or a Experimental_VideoModelV3 object.
 */
export type VideoModel = string | Experimental_VideoModelV3;

export type VideoModelProviderMetadata =
  Experimental_VideoModelV3ProviderMetadata;
