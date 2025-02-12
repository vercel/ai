import { expect } from 'vitest';
import { deepinfra as provider, DeepInfraErrorData } from '@ai-sdk/deepinfra';
import { APICallError } from 'ai';
import {
  createEmbeddingModelWithCapabilities,
  createLanguageModelWithCapabilities,
  createFeatureTestSuite,
} from '../feature-test-suite';
import type { ModelConfig } from '../types/model';
import 'dotenv/config';

export default function runTests(modelConfig: ModelConfig) {
  const commonConfig = {
    name: 'DeepInfra',
    timeout: 10000,
    errorValidators: {
      language: (error: APICallError) => {
        expect(
          (error.data as DeepInfraErrorData).error.message ===
            'The model `no-such-model` does not exist',
        ).toBe(true);
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
  }
}
