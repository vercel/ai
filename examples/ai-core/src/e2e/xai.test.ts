import 'dotenv/config';
import { expect } from 'vitest';
import { xai as provider, XaiErrorData } from '@ai-sdk/xai';
import { createFeatureTestSuite } from './feature-test-suite';
import { APICallError } from '@ai-sdk/provider';

createFeatureTestSuite({
  name: 'xAI',
  models: {
    invalidModel: provider.chat('no-such-model'),
    languageModels: [
      // provider.chat('grok-beta'),
      provider.chat('grok-2-1212'),
      // provider.chat('grok-vision-beta'),
      // provider.chat('grok-2-vision-1212'),
      // provider.languageModel('grok-beta'),
      // provider.languageModel('grok-2-1212'),
      // provider.languageModel('grok-vision-beta'),
      // provider.languageModel('grok-2-vision-1212'),
    ],
  },
  timeout: 10000,
  customAssertions: {
    errorValidator: (error: APICallError) => {
      expect((error.data as XaiErrorData).code).toBe(
        'Some requested entity was not found',
      );
    },
  },
})();
