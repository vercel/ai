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
  createChatModelFn: provider.chatModel,
  createCompletionModelFn: provider.completionModel,
  createEmbeddingModelFn: provider.textEmbeddingModel,
  models: {
    chat: [
      'meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo',
      'mistralai/Mistral-7B-Instruct-v0.1',
      'google/gemma-2b-it',
      'meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo',
      'mistralai/Mixtral-8x7B-Instruct-v0.1',
      'Qwen/Qwen2.5-72B-Instruct-Turbo',
      'databricks/dbrx-instruct',
    ],
    completion: ['Qwen/Qwen2.5-Coder-32B-Instruct'],
    embedding: [
      'togethercomputer/m2-bert-80M-8k-retrieval',
      'BAAI/bge-base-en-v1.5',
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
