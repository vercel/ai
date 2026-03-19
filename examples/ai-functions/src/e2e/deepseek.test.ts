import 'dotenv/config';
import { expect } from 'vitest';
import { deepseek as provider } from '@ai-sdk/deepseek';
import { APICallError } from 'ai';
import {
  createFeatureTestSuite,
  createLanguageModelWithCapabilities,
} from './feature-test-suite';
import { DeepSeekErrorData } from '@ai-sdk/deepseek';

const createChatModel = (modelId: string) =>
  createLanguageModelWithCapabilities(provider.chat(modelId));

createFeatureTestSuite({
  name: 'DeepSeek',
  models: {
    invalidModel: provider.chat('no-such-model'),
    languageModels: [createChatModel('deepseek-chat')],
  },
  timeout: 10000,
  customAssertions: {
    errorValidator: (error: APICallError) => {
      expect(
        (error.data as DeepSeekErrorData).error.message === 'Model Not Exist',
      ).toBe(true);
    },
  },
})();
