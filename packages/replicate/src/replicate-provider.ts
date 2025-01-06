import { ReplicateImageModel } from './replicate-image-model';
import type { ReplicateImageModelId, ReplicateImageModel as ReplicateImageModelType } from './replicate-image-model';
import type { ReplicateConfig } from './replicate-config';
import { createReplicateConfig } from './replicate-config';

export interface ReplicateProviderSettings extends Omit<ReplicateConfig, 'provider'> {}

export interface ReplicateProvider {
  /**
   * Creates an image generation model
   */
  image(modelId: ReplicateImageModelId): ReplicateImageModelType;
}

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
export const replicate = createReplicate({ apiToken: process.env.REPLICATE_API_TOKEN ?? '' }); 