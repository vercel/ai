import 'dotenv/config';
import { expect } from 'vitest';
import { VeniceErrorData, venice as provider } from '@ai-sdk/venice';
import {
  createFeatureTestSuite,
  createLanguageModelWithCapabilities,
} from './feature-test-suite';
import { APICallError } from '@ai-sdk/provider';

// Feature test suite
const createChatModel = (modelId: string) =>
  createLanguageModelWithCapabilities(provider.chat(modelId), [
    'textCompletion',
    'toolCalls',
  ]);

createFeatureTestSuite({
  name: 'Venice',
  models: {
    invalidModel: provider.chat('no-such-model'),
    languageModels: [
      createChatModel('llama-3.3-70b'),
    ],
  },
  timeout: 30000,
  customAssertions: {
    errorValidator: (error: APICallError) => {
      expect((error.data as VeniceErrorData).error).toMatch(/not found/i);
    },
  },
})();
