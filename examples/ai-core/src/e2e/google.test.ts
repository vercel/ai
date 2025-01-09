import 'dotenv/config';
import { expect } from 'vitest';
import { GoogleErrorData, google as provider } from '@ai-sdk/google';
import { APICallError, LanguageModelV1 } from 'ai';
import {
  ModelWithCapabilities,
  createEmbeddingModelWithCapabilities,
  createFeatureTestSuite,
  createLanguageModelWithCapabilities,
  defaultChatModelCapabilities,
} from './feature-test-suite';

const createChatModel = (
  modelId: string,
): ModelWithCapabilities<LanguageModelV1> =>
  createLanguageModelWithCapabilities(provider.chat(modelId));

const createSearchGroundedModel = (
  modelId: string,
): ModelWithCapabilities<LanguageModelV1> => {
  const model = provider.chat(modelId, { useSearchGrounding: true });
  return {
    model,
    capabilities: [...defaultChatModelCapabilities, 'searchGrounding'],
  };
};

createFeatureTestSuite({
  name: 'Google Generative AI',
  models: {
    invalidModel: provider.chat('no-such-model'),
    languageModels: [
      createSearchGroundedModel('gemini-1.5-flash-latest'),
      createChatModel('gemini-1.5-flash-latest'),
      // Gemini 2.0 and Pro models have low quota limits and may require billing enabled.
      createChatModel('gemini-2.0-flash-exp'),
      createSearchGroundedModel('gemini-2.0-flash-exp'),
      createChatModel('gemini-1.5-pro-latest'),
      createChatModel('gemini-1.0-pro'),
    ],
    embeddingModels: [
      createEmbeddingModelWithCapabilities(
        provider.textEmbeddingModel('text-embedding-004'),
      ),
    ],
  },
  timeout: 10000,
  customAssertions: {
    skipUsage: true,
    errorValidator: (error: APICallError) => {
      console.log(error);
      expect((error.data as GoogleErrorData).error.message).match(
        /models\/no\-such\-model is not found/,
      );
    },
  },
})();
