import 'dotenv/config';
import { expect } from 'vitest';
import { zai as provider } from '@ai-sdk/zai';
import type { APICallError } from 'ai';
import {
  createFeatureTestSuite,
  createLanguageModelWithCapabilities,
} from './feature-test-suite';

const createChatModel = (modelId: string) =>
  createLanguageModelWithCapabilities(provider.chatModel(modelId), [
    'textCompletion',
    'objectGeneration',
  ]);

createFeatureTestSuite({
  name: 'Z.AI',
  models: {
    invalidModel: provider.chatModel('no-such-model'),
    languageModels: [createChatModel('glm-5.2')],
  },
  timeout: 60000,
  customAssertions: {
    errorValidator: (error: APICallError) => {
      expect(error.message).toMatch(/model.*not found|invalid.*model|error/i);
    },
  },
})();
