import 'dotenv/config';
import { expect } from 'vitest';
import { azure as provider } from '@ai-sdk/azure';
import { APICallError } from 'ai';
import {
  createFeatureTestSuite,
  createLanguageModelWithCapabilities,
  createEmbeddingModelWithCapabilities,
} from './feature-test-suite';

const createChatModel = (deploymentId: string) =>
  createLanguageModelWithCapabilities(provider.chat(deploymentId));

createFeatureTestSuite({
  name: 'Azure OpenAI',
  models: {
    invalidModel: provider.chat('no-such-deployment'),
    languageModels: [
      createChatModel(process.env.AZURE_OPENAI_DEPLOYMENT_NAME ?? 'gpt-4o'),
    ],
    embeddingModels: process.env.AZURE_OPENAI_EMBEDDING_DEPLOYMENT_NAME
      ? [
          createEmbeddingModelWithCapabilities(
            provider.embeddingModel(
              process.env.AZURE_OPENAI_EMBEDDING_DEPLOYMENT_NAME,
            ),
          ),
        ]
      : [],
  },
  timeout: 30000,
  customAssertions: {
    errorValidator: (error: APICallError) => {
      expect(error.message).toMatch(
        /deployment.*not found|invalid|does not exist/i,
      );
    },
  },
})();
