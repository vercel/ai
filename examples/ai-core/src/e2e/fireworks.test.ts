import 'dotenv/config';
import { expect } from 'vitest';
import { fireworks as provider, FireworksErrorData } from '@ai-sdk/fireworks';
import { APICallError, LanguageModelV1 } from '@ai-sdk/provider';
import {
  Capability,
  createFeatureTestSuite,
  ModelWithCapabilities,
} from './feature-test-suite';

const createBaseChatModel = (
  modelId: string,
): ModelWithCapabilities<LanguageModelV1> => ({
  model: provider.chatModel(modelId),
  capabilities: [
    'imageInput',
    'objectGeneration',
    'pdfInput',
    'textCompletion',
    'toolCalls',
  ],
});

const createBaseCompletionModel = (
  modelId: string,
): ModelWithCapabilities<LanguageModelV1> => ({
  model: provider.completionModel(modelId),
  capabilities: [
    'imageInput',
    'objectGeneration',
    'pdfInput',
    'textCompletion',
    'toolCalls',
  ],
});

createFeatureTestSuite({
  name: 'Fireworks',
  models: {
    invalidModel: provider.chatModel('no-such-model'),
    languageModels: [
      createBaseChatModel('accounts/fireworks/models/firefunction-v2'),
      createBaseChatModel('accounts/fireworks/models/llama-v3p3-70b-instruct'),
      createBaseChatModel('accounts/fireworks/models/mixtral-8x7b-instruct'),
      createBaseChatModel('accounts/fireworks/models/qwen2p5-72b-instruct'),
      createBaseCompletionModel(
        'accounts/fireworks/models/llama-v3-8b-instruct',
      ),
      createBaseCompletionModel('accounts/fireworks/models/llama-v2-34b-code'),
    ],
    embeddingModels: [
      {
        model: provider.textEmbeddingModel('nomic-ai/nomic-embed-text-v1.5'),
        capabilities: ['embedding'] satisfies Capability[],
      },
    ],
    imageModels: [
      {
        model: provider.image('accounts/fireworks/models/flux-1-dev-fp8'),
        capabilities: ['imageInput'] satisfies Capability[],
      },
    ],
  },
  timeout: 10000,
  customAssertions: {
    errorValidator: (error: APICallError) => {
      expect((error.data as FireworksErrorData).error).toBe(
        'Model not found, inaccessible, and/or not deployed',
      );
    },
  },
})();
