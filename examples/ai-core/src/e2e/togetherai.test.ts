import 'dotenv/config';
import { expect } from 'vitest';
import {
  togetherai as provider,
  TogetherAIErrorData,
} from '@ai-sdk/togetherai';
import { APICallError } from 'ai';
import { createFeatureTestSuite } from './feature-test-suite';

createFeatureTestSuite({
  name: 'TogetherAI',
  models: {
    invalidModel: provider.chatModel('no-such-model'),
    languageModels: [
      provider.chatModel('meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo'),
      provider.chatModel('mistralai/Mistral-7B-Instruct-v0.1'),
      provider.chatModel('google/gemma-2b-it'),
      provider.chatModel('meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo'),
      provider.chatModel('mistralai/Mixtral-8x7B-Instruct-v0.1'),
      provider.chatModel('Qwen/Qwen2.5-72B-Instruct-Turbo'),
      provider.chatModel('databricks/dbrx-instruct'),
      provider.completionModel('Qwen/Qwen2.5-Coder-32B-Instruct'),
    ],
    embeddingModels: [
      provider.textEmbeddingModel('togethercomputer/m2-bert-80M-8k-retrieval'),
      provider.textEmbeddingModel('BAAI/bge-base-en-v1.5'),
    ],
  },
  timeout: 10000,
  customAssertions: {
    skipUsage: true,
    errorValidator: (error: APICallError) => {
      expect((error.data as TogetherAIErrorData).error.message).toMatch(
        /^Unable to access model/,
      );
    },
  },
})();
