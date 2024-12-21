import 'dotenv/config';
import { expect } from 'vitest';
import { deepinfra as provider, DeepInfraErrorData } from '@ai-sdk/deepinfra';
import { APICallError } from 'ai';
import { createFeatureTestSuite } from './feature-test-suite';

createFeatureTestSuite({
  name: 'DeepInfra',
  createChatModelFn: provider.chatModel,
  createCompletionModelFn: provider.completionModel,
  createEmbeddingModelFn: provider.textEmbeddingModel,
  models: {
    chat: [
      'google/codegemma-7b-it', // no tools, objects, or images
      'google/gemma-2-9b-it', // no tools, objects, or images
      'meta-llama/Llama-3.2-11B-Vision-Instruct', // no tools, *does* support images
      'meta-llama/Llama-3.2-90B-Vision-Instruct', // no tools, *does* support images
      'meta-llama/Llama-3.3-70B-Instruct-Turbo', // no image input
      'meta-llama/Llama-3.3-70B-Instruct', // no image input
      'meta-llama/Meta-Llama-3.1-405B-Instruct', // no image input
      'meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo', // no image input
      'meta-llama/Meta-Llama-3.1-70B-Instruct', // no image input
      'meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo', // no *streaming* tools, no image input
      'meta-llama/Meta-Llama-3.1-8B-Instruct', // no image input
      'microsoft/WizardLM-2-8x22B', // no objects, tools, or images
      'mistralai/Mixtral-8x7B-Instruct-v0.1', // no *streaming* tools, no image input
      'nvidia/Llama-3.1-Nemotron-70B-Instruct', // no images
      'Qwen/Qwen2-7B-Instruct', // no tools, no image input
      'Qwen/Qwen2.5-72B-Instruct', // no images
      'Qwen/Qwen2.5-Coder-32B-Instruct', // no tool calls, no image input
      'Qwen/QwQ-32B-Preview', // no tools, no image input
    ],
    completion: [
      'meta-llama/Meta-Llama-3.1-8B-Instruct',
      'Qwen/Qwen2-7B-Instruct',
    ],
    embedding: [
      'BAAI/bge-base-en-v1.5',
      'intfloat/e5-base-v2',
      'sentence-transformers/all-mpnet-base-v2',
    ],
  },
  timeout: 10000,
  customAssertions: {
    errorValidator: (error: APICallError) => {
      expect(
        (error.data as DeepInfraErrorData).error.message ===
          'The model `no-such-model` does not exist',
      ).toBe(true);
    },
  },
})();
