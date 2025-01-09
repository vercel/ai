import 'dotenv/config';
import { expect } from 'vitest';
import { deepinfra as provider, DeepInfraErrorData } from '@ai-sdk/deepinfra';
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
  name: 'DeepInfra',
  models: {
    invalidModel: provider.chatModel('no-such-model'),
    languageModels: [
      createBaseChatModel('deepseek-ai/DeepSeek-V3'), // no tools, streaming objects, or images
      createBaseChatModel('google/codegemma-7b-it'), // no tools, objects, or images
      createBaseChatModel('google/gemma-2-9b-it'), // no tools, objects, or images
      createBaseChatModel('meta-llama/Llama-3.2-11B-Vision-Instruct'), // no tools, *does* support images
      createBaseChatModel('meta-llama/Llama-3.2-90B-Vision-Instruct'), // no tools, *does* support images
      createBaseChatModel('meta-llama/Llama-3.3-70B-Instruct-Turbo'), // no image input
      createBaseChatModel('meta-llama/Llama-3.3-70B-Instruct'), // no image input
      createBaseChatModel('meta-llama/Meta-Llama-3.1-405B-Instruct'), // no image input
      createBaseChatModel('meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo'), // no image input
      createBaseChatModel('meta-llama/Meta-Llama-3.1-70B-Instruct'), // no image input
      createBaseChatModel('meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo'), // no *streaming* tools, no image input
      createBaseChatModel('meta-llama/Meta-Llama-3.1-8B-Instruct'), // no image input
      createBaseChatModel('microsoft/WizardLM-2-8x22B'), // no objects, tools, or images
      createBaseChatModel('mistralai/Mixtral-8x7B-Instruct-v0.1'), // no *streaming* tools, no image input
      createBaseChatModel('nvidia/Llama-3.1-Nemotron-70B-Instruct'), // no images
      createBaseChatModel('Qwen/Qwen2-7B-Instruct'), // no tools, no image input
      createBaseChatModel('Qwen/Qwen2.5-72B-Instruct'), // no images
      createBaseChatModel('Qwen/Qwen2.5-Coder-32B-Instruct'), // no tool calls, no image input
      createBaseChatModel('Qwen/QwQ-32B-Preview'), // no tools, no image input
      createBaseCompletionModel('meta-llama/Meta-Llama-3.1-8B-Instruct'),
      createBaseCompletionModel('Qwen/Qwen2-7B-Instruct'),
    ],
    embeddingModels: [
      {
        model: provider.textEmbeddingModel('BAAI/bge-base-en-v1.5'),
        capabilities: ['embedding'] satisfies Capability[],
      },
      {
        model: provider.textEmbeddingModel('intfloat/e5-base-v2'),
        capabilities: ['embedding'] satisfies Capability[],
      },
      {
        model: provider.textEmbeddingModel(
          'sentence-transformers/all-mpnet-base-v2',
        ),
        capabilities: ['embedding'] satisfies Capability[],
      },
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
