import 'dotenv/config';
import { expect } from 'vitest';
import { xai as provider, XaiErrorData } from '@ai-sdk/xai';
import { createFeatureTestSuite } from './feature-test-suite';
import { APICallError } from '@ai-sdk/provider';

createFeatureTestSuite({
  name: 'xAI',
  createChatModelFn: provider.chat,
  createCompletionModelFn: provider.languageModel,
  createEmbeddingModelFn: provider.textEmbeddingModel,
  models: {
    chat: [
      'grok-beta',
      'grok-2-1212',
      'grok-vision-beta',
      'grok-2-vision-1212',
    ],
    completion: [
      'grok-beta',
      'grok-2-1212',
      'grok-vision-beta',
      'grok-2-vision-1212',
    ],
  },
  timeout: 30000,
  customAssertions: {
    errorValidator: (error: APICallError) => {
      expect((error.data as XaiErrorData).code).toBe(
        'Some requested entity was not found',
      );
    },
  },
})();
