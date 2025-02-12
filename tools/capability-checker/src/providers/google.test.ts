import { expect } from 'vitest';
import { GoogleErrorData, google as provider } from '@ai-sdk/google';
import { APICallError, LanguageModelV1 } from 'ai';
import {
  createEmbeddingModelWithCapabilities,
  createLanguageModelWithCapabilities,
  createFeatureTestSuite,
  defaultChatModelCapabilities,
} from '../feature-test-suite';
import type { ModelConfig, ModelWithCapabilities } from '../types/model';
import 'dotenv/config';

const createBaseModel = (
  modelId: string,
): ModelWithCapabilities<LanguageModelV1> =>
  createLanguageModelWithCapabilities(provider.chat(modelId));

const createSearchGroundedModel = (
  modelId: string,
): ModelWithCapabilities<LanguageModelV1> => ({
  model: provider.chat(modelId, { useSearchGrounding: true }),
  capabilities: [...defaultChatModelCapabilities, 'searchGrounding'],
});

const createModelVariants = (
  modelId: string,
): ModelWithCapabilities<LanguageModelV1>[] => [
  createBaseModel(modelId),
  createSearchGroundedModel(modelId),
];

export default function runTests(modelConfig: ModelConfig) {
  const commonConfig = {
    name: 'Google Generative AI',
    timeout: 20000,
    skipUsage: true,
  };

  switch (modelConfig.modelType) {
    case 'language': {
      createFeatureTestSuite({
        ...commonConfig,
        errorValidators: {
          language: (error: APICallError) => {
            expect((error.data as GoogleErrorData).error.message).match(
              /models\/no-such-model is not found/,
            );
          },
        },
        models: {
          language: [...createModelVariants(modelConfig.modelId)],
        },
      })();
      break;
    }
    case 'embedding': {
      createFeatureTestSuite({
        ...commonConfig,
        models: {
          embedding: [
            createEmbeddingModelWithCapabilities(
              provider.textEmbeddingModel(modelConfig.modelId),
            ),
          ],
        },
      })();
      break;
    }
  }
}
