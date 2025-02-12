import { expect } from 'vitest';
import { openai as provider } from '@ai-sdk/openai';
import { APICallError } from 'ai';
import {
  createLanguageModelWithCapabilities,
  createEmbeddingModelWithCapabilities,
  createFeatureTestSuite,
  createImageModelWithCapabilities,
} from '../feature-test-suite';
import type { ModelConfig } from '../types/model';
import 'dotenv/config';

export default function runTests(modelConfig: ModelConfig) {
  const commonConfig = {
    name: 'OpenAI',
    timeout: 30000,
    errorValidators: {
      language: (error: APICallError) => {
        expect(error.message).toMatch(/The model .* does not exist/);
      },
    },
  };

  switch (modelConfig.modelType) {
    case 'language': {
      const model = provider.chat(modelConfig.modelId);
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
      const model = provider.embedding(modelConfig.modelId);
      createFeatureTestSuite({
        ...commonConfig,
        models: {
          embedding: [
            createEmbeddingModelWithCapabilities(
              model,
              modelConfig.expectedCapabilities,
            ),
          ],
        },
      })();
      break;
    }

    case 'image': {
      const model = provider.image(modelConfig.modelId);
      createFeatureTestSuite({
        ...commonConfig,
        models: {
          image: [
            createImageModelWithCapabilities(
              model,
              modelConfig.expectedCapabilities,
            ),
          ],
        },
      });
      break;
    }
  }
}
