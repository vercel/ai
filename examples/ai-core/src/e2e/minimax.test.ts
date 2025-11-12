import 'dotenv/config';
import { expect } from 'vitest';
import { minimax as provider } from '@ai-sdk/minimax';
import { APICallError } from 'ai';
import {
  createFeatureTestSuite,
  createLanguageModelWithCapabilities,
} from './feature-test-suite';
import { MinimaxErrorData } from '@ai-sdk/minimax';

const createChatModel = (modelId: string) =>
  createLanguageModelWithCapabilities(provider.chat(modelId));

createFeatureTestSuite({
  name: 'MiniMax',
  models: {
    invalidModel: provider.chat('no-such-model'),
    languageModels: [createChatModel('MiniMax-M2')],
  },
  timeout: 10000,
  customAssertions: {
    errorValidator: (error: APICallError) => {
      expect(
        (error.data as MinimaxErrorData).error.message,
      ).toBeDefined();
    },
  },
})();

