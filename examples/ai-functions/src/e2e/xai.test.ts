import 'dotenv/config';
import { expect } from 'vitest';
import { xai as provider } from '@ai-sdk/xai';
import {
  createFeatureTestSuite,
  createLanguageModelWithCapabilities,
} from './feature-test-suite';
import type { APICallError } from '@ai-sdk/provider';

const createLanguageModel = (modelId: string) =>
  createLanguageModelWithCapabilities(provider(modelId));

const createCompletionModel = (modelId: string) =>
  createLanguageModelWithCapabilities(provider.languageModel(modelId), [
    'textCompletion',
  ]);

createFeatureTestSuite({
  name: 'xAI',
  models: {
    invalidModel: provider('no-such-model'),
    languageModels: [
      createLanguageModel('grok-4.5'),
      createLanguageModel('grok-4-1-fast-reasoning'),
      createLanguageModel('grok-4-1-fast-non-reasoning'),
      createLanguageModel('grok-4'),
      createLanguageModel('grok-3-beta'),
      createLanguageModel('grok-3-fast-beta'),
      createLanguageModel('grok-3-mini-beta'),
      createLanguageModel('grok-3-mini-fast-beta'),
      createLanguageModel('grok-3'),
      createCompletionModel('grok-3'),
    ],
  },
  timeout: 30000,
  customAssertions: {
    errorValidator: (error: APICallError) => {
      expect(error.message).toContain('model');
    },
  },
})();
