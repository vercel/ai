import type {
  Experimental_ArtifactModelV4,
  SharedV4ProviderMetadata,
} from '@ai-sdk/provider';

/**
 * An artifact model can be a string (model ID) or an artifact model object.
 */
export type ArtifactModel = string | Experimental_ArtifactModelV4;

/**
 * Metadata returned by the artifact model provider.
 */
export type ArtifactModelProviderMetadata = SharedV4ProviderMetadata;
