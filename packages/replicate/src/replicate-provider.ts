import { ReplicateImageModel } from './replicate-image-model';
import type { ReplicateImageModelId, ReplicateImageModel as ReplicateImageModelType } from './replicate-image-model';
import type { ReplicateConfig } from './replicate-config';
import { createReplicateConfig } from './replicate-config';

export interface ReplicateProviderSettings extends Omit<ReplicateConfig, 'provider'> {}

export interface ReplicateProvider {
  (modelId: ReplicateImageModelId): ReplicateImageModelType;

  /**
   * Creates an image generation model
   */
  image(modelId: ReplicateImageModelId): ReplicateImageModelType;
}

/**
 * Create a Replicate provider instance.
 */
export function createReplicate(
  options: ReplicateProviderSettings,
): ReplicateProvider {
  const config = createReplicateConfig(options);

  const createImageModel = (modelId: ReplicateImageModelId) =>
    new ReplicateImageModel(modelId, config);

  const provider = (modelId: ReplicateImageModelId) => {
    return createImageModel(modelId);
  };

  provider.image = createImageModel;

  return provider as ReplicateProvider;
}

/**
 * Default Replicate provider instance
 */
export const replicate = createReplicate({ 
  apiToken: process.env.REPLICATE_API_TOKEN ?? '' 
}); 