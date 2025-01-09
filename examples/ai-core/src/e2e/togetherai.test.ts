import 'dotenv/config';
import { expect } from 'vitest';
import {
  togetherai as provider,
  TogetherAIErrorData,
} from '@ai-sdk/togetherai';
import { APICallError, LanguageModelV1 } from 'ai';
import type { Capability } from './feature-test-suite';
import {
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

const createBaseLanguageModel = (
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
  name: 'TogetherAI',
  models: {
    invalidModel: provider.chatModel('no-such-model'),
    languageModels: [
      createBaseChatModel('deepseek-ai/DeepSeek-V3'), // no tools, objects, or images
      createBaseChatModel('meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo'),
      createBaseChatModel('mistralai/Mistral-7B-Instruct-v0.1'),
      createBaseChatModel('google/gemma-2b-it'),
      createBaseChatModel('meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo'),
      createBaseChatModel('mistralai/Mixtral-8x7B-Instruct-v0.1'),
      createBaseChatModel('Qwen/Qwen2.5-72B-Instruct-Turbo'),
      createBaseChatModel('databricks/dbrx-instruct'),
      createBaseLanguageModel('Qwen/Qwen2.5-Coder-32B-Instruct'),
    ],
    embeddingModels: [
      {
        model: provider.textEmbeddingModel(
          'togethercomputer/m2-bert-80M-8k-retrieval',
        ),
        capabilities: ['embedding'] satisfies Capability[],
      },
      {
        model: provider.textEmbeddingModel('BAAI/bge-base-en-v1.5'),
        capabilities: ['embedding'] satisfies Capability[],
      },
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
