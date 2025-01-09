import 'dotenv/config';
import { expect } from 'vitest';
import { GoogleErrorData, google as provider } from '@ai-sdk/google';
import { APICallError } from 'ai';
import { createFeatureTestSuite } from './feature-test-suite';

const createBaseModel = (modelId: string) => ({
  model: provider.chat(modelId),
  capabilities: {},
});

const createSearchGroundedModel = (modelName: string) => ({
  model: provider.chat(modelName, {
    useSearchGrounding: true,
  }),
  capabilities: {
    searchGrounding: true,
  },
});

createFeatureTestSuite({
  name: 'Google Generative AI',
  models: {
    invalidModel: provider.chat('no-such-model'),
    languageModels: [
      // createBaseModel('gemini-1.5-flash-latest'),
      // Gemini 2.0 and Pro models have low quota limits and may require billing enabled.
      createBaseModel('gemini-2.0-flash-exp'),
      // createBaseModel('gemini-1.5-pro-latest'),
      // createBaseModel('gemini-1.0-pro'),
    ],
    embeddingModels: [
      {
        model: provider.textEmbeddingModel('text-embedding-004'),
      },
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

createFeatureTestSuite({
  name: 'Google Generative AI - Search Grounding Tests',
  models: {
    languageModels: [
      // createSearchGroundedModel('gemini-1.5-flash-latest'),
      createSearchGroundedModel('gemini-2.0-flash-exp'),
    ],
  },
  timeout: 20000,
  customAssertions: {
    skipUsage: false,
  },
  testTypes: ['searchGrounding'],
})();
