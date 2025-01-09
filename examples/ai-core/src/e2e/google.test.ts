import 'dotenv/config';
import { expect } from 'vitest';
import { GoogleErrorData, google as provider } from '@ai-sdk/google';
import { APICallError, LanguageModelV1 } from 'ai';
import {
  createFeatureTestSuite,
  ModelWithCapabilities,
} from './feature-test-suite';

const createBaseModel = (
  modelId: string,
): ModelWithCapabilities<LanguageModelV1> => ({
  model: provider.chat(modelId),
  capabilities: [
    'imageInput',
    'objectGeneration',
    'pdfInput',
    'textCompletion',
    'toolCalls',
  ],
});

const createSearchGroundedModel = (
  modelId: string,
): ModelWithCapabilities<LanguageModelV1> => ({
  model: provider.chat(modelId, { useSearchGrounding: true }),
  capabilities: [
    'imageInput',
    'objectGeneration',
    'pdfInput',
    'searchGrounding',
    'textCompletion',
    'toolCalls',
  ],
});

createFeatureTestSuite({
  name: 'Google Generative AI',
  models: {
    invalidModel: provider.chat('no-such-model'),
    languageModels: [
      // createSearchGroundedModel('gemini-1.5-flash-latest'),
      // createBaseModel('gemini-1.5-flash-latest'),
      // // Gemini 2.0 and Pro models have low quota limits and may require billing enabled.
      // createBaseModel('gemini-2.0-flash-exp'),
      createSearchGroundedModel('gemini-2.0-flash-exp'),
      // createBaseModel('gemini-1.5-pro-latest'),
      // createBaseModel('gemini-1.0-pro'),
    ],
    embeddingModels: [
      {
        model: provider.textEmbeddingModel('text-embedding-004'),
        capabilities: ['embedding'],
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
