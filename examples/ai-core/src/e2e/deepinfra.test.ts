import 'dotenv/config';
import { expect } from 'vitest';
import { deepinfra as provider, DeepInfraErrorData } from '@ai-sdk/deepinfra';
import { APICallError } from 'ai';
import {
  createEmbeddingModelWithCapabilities,
  createFeatureTestSuite,
  createLanguageModelWithCapabilities,
} from './feature-test-suite';

const createChatModel = (modelId: string) =>
  createLanguageModelWithCapabilities(provider.chatModel(modelId));

const createCompletionModel = (modelId: string) =>
  createLanguageModelWithCapabilities(provider.completionModel(modelId));

createFeatureTestSuite({
  name: 'DeepInfra',
  models: {
    invalidModel: provider.chatModel('no-such-model'),
    languageModels: [
      createChatModel('deepseek-ai/DeepSeek-V3'), // no tools, streaming objects, or images
      // createChatModel('google/codegemma-7b-it'), // no tools, objects, or images
      // createChatModel('google/gemma-2-9b-it'), // no tools, objects, or images
      // createChatModel('meta-llama/Llama-3.2-11B-Vision-Instruct'), // no tools, *does* support images
      // createChatModel('meta-llama/Llama-3.2-90B-Vision-Instruct'), // no tools, *does* support images
      // createChatModel('meta-llama/Llama-3.3-70B-Instruct-Turbo'), // no image input
      // createChatModel('meta-llama/Llama-3.3-70B-Instruct'), // no image input
      // createChatModel('meta-llama/Meta-Llama-3.1-405B-Instruct'), // no image input
      // createChatModel('meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo'), // no image input
      // createChatModel('meta-llama/Meta-Llama-3.1-70B-Instruct'), // no image input
      // createChatModel('meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo'), // no *streaming* tools, no image input
      // createChatModel('meta-llama/Meta-Llama-3.1-8B-Instruct'), // no image input
      // createChatModel('microsoft/WizardLM-2-8x22B'), // no objects, tools, or images
      // createChatModel('mistralai/Mixtral-8x7B-Instruct-v0.1'), // no *streaming* tools, no image input
      // createChatModel('nvidia/Llama-3.1-Nemotron-70B-Instruct'), // no images
      // createChatModel('Qwen/Qwen2-7B-Instruct'), // no tools, no image input
      // createChatModel('Qwen/Qwen2.5-72B-Instruct'), // no images
      // createChatModel('Qwen/Qwen2.5-Coder-32B-Instruct'), // no tool calls, no image input
      // createChatModel('Qwen/QwQ-32B-Preview'), // no tools, no image input
      // createCompletionModel('meta-llama/Meta-Llama-3.1-8B-Instruct'),
      // createCompletionModel('Qwen/Qwen2-7B-Instruct'),
    ],
    embeddingModels: [
      createEmbeddingModelWithCapabilities(
        provider.textEmbeddingModel('BAAI/bge-base-en-v1.5'),
      ),
      createEmbeddingModelWithCapabilities(
        provider.textEmbeddingModel('intfloat/e5-base-v2'),
      ),
      createEmbeddingModelWithCapabilities(
        provider.textEmbeddingModel('sentence-transformers/all-mpnet-base-v2'),
      ),
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
