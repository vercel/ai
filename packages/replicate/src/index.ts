export * from './replicate-image-model';
export * from './replicate-config';
export * from './replicate-error';

import { ReplicateImageModel, ReplicateImageModelId } from './replicate-image-model';
import { ReplicateConfig, createReplicateConfig } from './replicate-config';

export function createReplicate(config: Omit<ReplicateConfig, 'provider'>) {
  const fullConfig = createReplicateConfig(config);
  
  return {
    image: (modelId: ReplicateImageModelId) => 
      new ReplicateImageModel(modelId, fullConfig),
  };
} 