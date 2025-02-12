import { expect } from 'vitest';
import {
  togetherai as provider,
  TogetherAIErrorData,
} from '@ai-sdk/togetherai';
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
    name: 'TogetherAI',
    timeout: 10000,
    errorValidators: {
      language: (error: APICallError) => {
        expect((error.data as TogetherAIErrorData).error.message).toMatch(
          /^Unable to access model/,
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
  }
}
