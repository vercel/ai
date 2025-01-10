import 'dotenv/config';
import { expect } from 'vitest';
import { CerebrasErrorData, cerebras as provider } from '@ai-sdk/cerebras';
import {
  createFeatureTestSuite,
  createLanguageModelWithCapabilities,
} from './feature-test-suite';
import { APICallError } from '@ai-sdk/provider';

const createChatModel = (modelId: string) =>
  createLanguageModelWithCapabilities(provider.chat(modelId));

const createCompletionModel = (modelId: string) =>
  createLanguageModelWithCapabilities(provider.languageModel(modelId), [
    'textCompletion',
  ]);

createFeatureTestSuite({
  name: 'Cerebras',
  models: {
    invalidModel: provider.chat('no-such-model'),
    languageModels: [
      createChatModel('llama3.1-8b'),
      createChatModel('llama3.1-70b'),
      createChatModel('llama-3.3-70b'),
    ],
  },
  timeout: 30000,
  customAssertions: {
    errorValidator: (error: APICallError) => {
      expect((error.data as CerebrasErrorData).error.code).toMatch(
        /not found/i,
      );
    },
  },
})();
