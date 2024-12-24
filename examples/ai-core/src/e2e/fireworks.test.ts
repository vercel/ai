import 'dotenv/config';
import { expect } from 'vitest';
import { fireworks as provider, FireworksErrorData } from '@ai-sdk/fireworks';
import { APICallError } from '@ai-sdk/provider';
import { createFeatureTestSuite } from './feature-test-suite';

createFeatureTestSuite({
  name: 'Fireworks',
  createChatModelFn: provider.chatModel,
  createCompletionModelFn: provider.completionModel,
  createEmbeddingModelFn: provider.textEmbeddingModel,
  models: {
    chat: [
      'accounts/fireworks/models/firefunction-v2',
      'accounts/fireworks/models/llama-v3p3-70b-instruct',
      'accounts/fireworks/models/mixtral-8x7b-instruct',
      'accounts/fireworks/models/qwen2p5-72b-instruct',
    ],
    completion: [
      'accounts/fireworks/models/llama-v3-8b-instruct',
      'accounts/fireworks/models/llama-v2-34b-code',
    ],
    embedding: ['nomic-ai/nomic-embed-text-v1.5'],
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
