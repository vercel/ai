import 'dotenv/config';
import { expect } from 'vitest';
import { cerebras as provider, type CerebrasErrorData } from '@ai-sdk/cerebras';
import {
  createFeatureTestSuite,
  createLanguageModelWithCapabilities,
} from './feature-test-suite';
import type { APICallError } from '@ai-sdk/provider';

const createChatModel = (modelId: string) =>
  createLanguageModelWithCapabilities(provider.chat(modelId), [
    'objectGeneration',
    'textCompletion',
    'toolCalls',
  ]);

createFeatureTestSuite({
  name: 'Cerebras',
  models: {
    invalidModel: provider.chat('no-such-model'),
    languageModels: [
      createChatModel('gpt-oss-120b'),
      createLanguageModelWithCapabilities(provider.chat('gemma-4-31b'), [
        'imageInput',
        'objectGeneration',
        'textCompletion',
        'toolCalls',
      ]),
    ],
  },
  timeout: 30000,
  customAssertions: {
    errorValidator: (error: APICallError) => {
      expect((error.data as CerebrasErrorData).message).toMatch(/not exist/i);
    },
  },
})();
