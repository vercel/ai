import 'dotenv/config';
import { expect } from 'vitest';
import { fireworks as provider, FireworksErrorData } from '@ai-sdk/fireworks';
import { APICallError } from '@ai-sdk/provider';
import { createFeatureTestSuite } from './feature-test-suite';

createFeatureTestSuite({
  name: 'Fireworks',
  models: {
    invalidModel: provider.chatModel('no-such-model'),
    languageModels: [
      provider.chatModel('accounts/fireworks/models/firefunction-v2'),
      provider.chatModel('accounts/fireworks/models/llama-v3p3-70b-instruct'),
      provider.chatModel('accounts/fireworks/models/mixtral-8x7b-instruct'),
      provider.chatModel('accounts/fireworks/models/qwen2p5-72b-instruct'),
      provider.completionModel(
        'accounts/fireworks/models/llama-v3-8b-instruct',
      ),
      provider.completionModel('accounts/fireworks/models/llama-v2-34b-code'),
    ],
    embeddingModels: [
      provider.textEmbeddingModel('nomic-ai/nomic-embed-text-v1.5'),
    ],
    imageModels: [provider.image('accounts/fireworks/models/flux-1-dev-fp8')],
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
