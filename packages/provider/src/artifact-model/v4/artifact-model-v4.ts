import type { ArtifactModelV4CallOptions } from './artifact-model-v4-call-options';
import type { ArtifactModelV4Result } from './artifact-model-v4-result';

/**
 * Artifact generation model specification version 4.
 *
 * Artifact models generate one or more files, such as 3D meshes, material
 * archives, or preview images. Provider-specific controls belong in
 * `providerOptions` so the shared contract can remain file-oriented.
 */
export type ArtifactModelV4 = {
  /**
   * The artifact model interface version implemented by this model.
   */
  readonly specificationVersion: 'v4';

  /**
   * Name of the provider for logging purposes.
   */
  readonly provider: string;

  /**
   * Provider-specific model ID for logging purposes.
   */
  readonly modelId: string;

  /**
   * Generates one or more artifacts.
   */
  doGenerate(
    options: ArtifactModelV4CallOptions,
  ): PromiseLike<ArtifactModelV4Result>;
};
