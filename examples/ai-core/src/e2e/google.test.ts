import { GoogleErrorData, google as provider } from '@ai-sdk/google';
import { APICallError, ImageModelV2, LanguageModelV2 } from '@ai-sdk/provider';
import 'dotenv/config';
import { expect } from 'vitest';
import {
  ModelWithCapabilities,
  createEmbeddingModelWithCapabilities,
  createFeatureTestSuite,
  createLanguageModelWithCapabilities,
  createImageModelWithCapabilities,
  defaultChatModelCapabilities,
} from './feature-test-suite';
import { wrapLanguageModel } from 'ai';
import { defaultSettingsMiddleware } from 'ai';

const createChatModel = (
  modelId: string,
): ModelWithCapabilities<LanguageModelV2> =>
  createLanguageModelWithCapabilities(provider.chat(modelId));

const createImageModel = (
  modelId: string,
): ModelWithCapabilities<ImageModelV2> =>
  createImageModelWithCapabilities(provider.image(modelId));

const createSearchGroundedModel = (
  modelId: string,
): ModelWithCapabilities<LanguageModelV2> => {
  const model = provider.chat(modelId);
  return {
    model: wrapLanguageModel({
      model,
      middleware: defaultSettingsMiddleware({
        settings: {
          providerOptions: { google: { useSearchGrounding: true } },
        },
      }),
    }),
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
      // createChatModel('gemini-2.0-flash-exp'),
      // createSearchGroundedModel('gemini-2.0-flash-exp'),
      // createChatModel('gemini-1.5-pro-latest'),
      // createChatModel('gemini-1.0-pro'),
    ],
    embeddingModels: [
      createEmbeddingModelWithCapabilities(
        provider.textEmbeddingModel('gemini-embedding-001'),
      ),
    ],
    imageModels: [createImageModel('imagen-3.0-generate-002')],
  },
  timeout: 20000,
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
