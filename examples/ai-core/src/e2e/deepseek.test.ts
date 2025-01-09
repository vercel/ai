import 'dotenv/config';
import { expect } from 'vitest';
import { deepseek as provider } from '@ai-sdk/deepseek';
import { APICallError, LanguageModelV1 } from 'ai';
import {
  createFeatureTestSuite,
  ModelWithCapabilities,
} from './feature-test-suite';
import { DeepSeekErrorData } from '@ai-sdk/deepseek';

const createBaseChatModel = (
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

createFeatureTestSuite({
  name: 'DeepSeek',
  models: {
    invalidModel: provider.chat('no-such-model'),
    languageModels: [createBaseChatModel('deepseek-chat')],
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
