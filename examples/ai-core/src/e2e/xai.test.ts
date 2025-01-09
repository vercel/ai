import 'dotenv/config';
import { expect } from 'vitest';
import { xai as provider, XaiErrorData } from '@ai-sdk/xai';
import {
  createFeatureTestSuite,
  ModelWithCapabilities,
} from './feature-test-suite';
import { APICallError, LanguageModelV1 } from '@ai-sdk/provider';

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

const createBaseLanguageModel = (
  modelId: string,
): ModelWithCapabilities<LanguageModelV1> => ({
  model: provider.languageModel(modelId),
  capabilities: [
    'imageInput',
    'objectGeneration',
    'pdfInput',
    'textCompletion',
    'toolCalls',
  ],
});

createFeatureTestSuite({
  name: 'xAI',
  models: {
    invalidModel: provider.chat('no-such-model'),
    languageModels: [
      // createBaseModel('grok-beta'),
      createBaseChatModel('grok-2-1212'),
      // createBaseModel('grok-vision-beta'),
      // createBaseModel('grok-2-vision-1212'),
      // createBaseLanguageModel('grok-beta'),
      // createBaseLanguageModel('grok-2-1212'),
      // createBaseLanguageModel('grok-vision-beta'),
      // createBaseLanguageModel('grok-2-vision-1212'),
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
