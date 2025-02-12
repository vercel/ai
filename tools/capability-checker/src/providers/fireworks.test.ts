import { expect } from 'vitest';
import { fireworks as provider, FireworksErrorData } from '@ai-sdk/fireworks';
import { APICallError } from '@ai-sdk/provider';
import {
  createEmbeddingModelWithCapabilities,
  createImageModelWithCapabilities,
  createLanguageModelWithCapabilities,
  createFeatureTestSuite,
} from '../feature-test-suite';
import type { ModelConfig } from '../types/model';
import 'dotenv/config';

export default function runTests(modelConfig: ModelConfig) {
  const commonConfig = {
    name: 'Fireworks',
    timeout: 10000,
    errorValidators: {
      language: (error: APICallError) => {
        expect((error.data as FireworksErrorData).error).toBe(
          'Model not found, inaccessible, and/or not deployed',
        );
      },
    },
  };

  switch (modelConfig.modelType) {
    case 'language': {
      const model = provider.chatModel(modelConfig.modelId);
      createFeatureTestSuite({
        ...commonConfig,
        models: {
          language: [
            createLanguageModelWithCapabilities(
              model,
              modelConfig.expectedCapabilities,
            ),
          ],
        },
      })();
      break;
    }

    case 'embedding': {
      const model = provider.textEmbeddingModel(modelConfig.modelId);
      createFeatureTestSuite({
        ...commonConfig,
        models: {
          embedding: [createEmbeddingModelWithCapabilities(model)],
        },
      })();
      break;
    }

    case 'image': {
      const model = provider.image(modelConfig.modelId);
      createFeatureTestSuite({
        ...commonConfig,
        models: {
          image: [createImageModelWithCapabilities(model)],
        },
      })();
      break;
    }
  }
}
