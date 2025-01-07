import {
  ReplicateImageModel,
  ReplicateImageModelId,
} from './replicate-image-model';
import type { ReplicateConfig } from './replicate-config';

export interface ReplicateProviderSettings
  extends Omit<ReplicateConfig, 'provider'> {}

export interface ReplicateProvider {
  /**
   * Creates a Replicate image generation model.
   */
  image(modelId: ReplicateImageModelId): ReplicateImageModel;
}

/**
 * Create a Replicate provider instance.
 */
export function createReplicate(
  options: ReplicateProviderSettings,
): ReplicateProvider {
  const config = createReplicateConfig(options);

  return {
    image: (modelId: ReplicateImageModelId) =>
      new ReplicateImageModel(modelId, config),
  };
}

/**
 * Default Replicate provider instance
 */
export const replicate = createReplicate({
  apiToken: process.env.REPLICATE_API_TOKEN ?? '',
});

export function createReplicateConfig(
  config: Omit<ReplicateConfig, 'provider'>,
) {
  return {
    ...config,
    provider: 'replicate',
    baseURL: config.baseURL ?? 'https://api.replicate.com/v1',
    headers: {
      ...config.headers,
      Authorization: `Bearer ${config.apiToken}`,
    },
  };
}
