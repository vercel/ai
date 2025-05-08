import 'dotenv/config';
import { expect } from 'vitest';
import { hypermode as provider, HypermodeErrorData } from '@ai-sdk/hypermode';
import { APICallError } from 'ai';
import {
  createFeatureTestSuite,
  createLanguageModelWithCapabilities,
  createEmbeddingModelWithCapabilities,
} from './feature-test-suite';

const createChatModel = (modelId: string) =>
  createLanguageModelWithCapabilities(provider.chat(modelId), [
    'textCompletion',
  ]);

createFeatureTestSuite({
  name: 'Hypermode',
  models: {
    invalidModel: provider.chat('no-such-model'),
    languageModels: [
      createChatModel('meta-llama/llama-3.2-3b-instruct'),
      createChatModel('deepseek-ai/deepseek-r1-distill-llama-8b'),
      createChatModel('gpt-3.5-turbo'),
      createChatModel('gemini-1.5-flash'),
      createChatModel('claude-3-5-sonnet-20240620'),
    ],
    embeddingModels: [
      createEmbeddingModelWithCapabilities(
        provider.embedding('nomic-ai/nomic-embed-text-v1.5'),
      ),
      createEmbeddingModelWithCapabilities(
        provider.embedding('text-embedding-3-small'),
      ),
    ],
  },
  timeout: 30000,
  customAssertions: {
    errorValidator: (error: APICallError) => {
      expect((error.data as HypermodeErrorData).error.message).toMatch(
        /The model .* does not exist/,
      );
    },
  },
})();
