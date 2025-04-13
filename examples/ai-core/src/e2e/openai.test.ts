import { openai as provider } from '@ai-sdk/openai';
import { LanguageModelV2 } from '@ai-sdk/provider';
import { APICallError } from 'ai';
import 'dotenv/config';
import { expect } from 'vitest';
import {
  ModelWithCapabilities,
  createEmbeddingModelWithCapabilities,
  createFeatureTestSuite,
  createLanguageModelWithCapabilities,
} from './feature-test-suite';

const createChatModel = (
  modelId: string,
): ModelWithCapabilities<LanguageModelV2> =>
  createLanguageModelWithCapabilities(provider.chat(modelId));

createFeatureTestSuite({
  name: 'OpenAI',
  models: {
    invalidModel: provider.chat('no-such-model'),
    languageModels: [
      //   createChatModel('o1-mini'),
      createChatModel('gpt-4o-mini'),
      // createChatModel('gpt-3.5-turbo'),
      // createChatModel('gpt-4-turbo-preview'),
    ],
    embeddingModels: [
      createEmbeddingModelWithCapabilities(
        provider.textEmbeddingModel('text-embedding-3-small'),
      ),
    ],
  },
  timeout: 30000,
  customAssertions: {
    skipUsage: false,
    errorValidator: (error: APICallError) => {
      expect(error.message).toMatch(/The model .* does not exist/);
    },
  },
})();
