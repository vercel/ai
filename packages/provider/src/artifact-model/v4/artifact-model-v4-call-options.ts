import type { SharedV4ProviderOptions } from '../../shared';
import type { ArtifactModelV4File } from './artifact-model-v4-file';

export type ArtifactModelV4CallOptions = {
  /**
   * Text prompt for artifact generation.
   */
  prompt: string | undefined;

  /**
   * Input files for operations such as image-to-3D, multi-image-to-3D, or
   * remeshing an existing 3D asset.
   */
  inputs: Array<ArtifactModelV4File> | undefined;

  /**
   * Additional provider-specific options that are passed through to the
   * provider as request parameters.
   */
  providerOptions: SharedV4ProviderOptions;

  /**
   * Abort signal for cancelling the operation.
   */
  abortSignal?: AbortSignal;

  /**
   * Additional HTTP headers to be sent with the request.
   * Only applicable for HTTP-based providers.
   */
  headers?: Record<string, string | undefined>;
};
