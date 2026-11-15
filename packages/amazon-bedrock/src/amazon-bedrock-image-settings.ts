import {
  amazonBedrockImageModelCatalog,
  type AmazonBedrockModelIds,
} from './amazon-bedrock-model-catalog';

export type AmazonBedrockImageModelId =
  | AmazonBedrockModelIds['image']
  | (string & {});

// Compatibility projection of the model catalog.
export const modelMaxImagesPerCall: Record<AmazonBedrockImageModelId, number> =
  {
    'amazon.nova-canvas-v1:0':
      amazonBedrockImageModelCatalog['amazon.nova-canvas-v1:0'].capabilities
        .image.maxImagesPerCall,
  };
