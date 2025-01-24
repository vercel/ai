import 'dotenv/config';
import { expect } from 'vitest';
import {
  perplexity as provider,
  PerplexityErrorData,
} from '@ai-sdk/perplexity';
import {
  createFeatureTestSuite,
  createLanguageModelWithCapabilities,
} from './feature-test-suite';
import { APICallError } from '@ai-sdk/provider';

const createChatModel = (modelId: string) =>
  createLanguageModelWithCapabilities(provider.chat(modelId));

createFeatureTestSuite({
  name: 'perplexity',
  models: {
    invalidModel: provider.chat('no-such-model'),
    languageModels: [createChatModel('sonar-pro'), createChatModel('sonar')],
  },
  timeout: 30000,
  customAssertions: {
    errorValidator: (error: APICallError) => {
      expect((error.data as PerplexityErrorData).code).toBe(
        'Some requested entity was not found',
      );
    },
  },
})();
