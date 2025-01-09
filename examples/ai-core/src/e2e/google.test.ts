import 'dotenv/config';
import { expect } from 'vitest';
import { GoogleErrorData, google as provider } from '@ai-sdk/google';
import { APICallError } from 'ai';
import { createFeatureTestSuite } from './feature-test-suite';

createFeatureTestSuite({
  name: 'Google Generative AI',
  models: {
    invalidModel: provider.chat('no-such-model'),
    languageModels: [
      // provider.chat('gemini-1.5-flash-latest'),
      // Gemini 2.0 and Pro models have low quota limits and may require billing enabled.
      // provider.chat('gemini-2.0-flash-exp'),
      provider.chat('gemini-1.5-pro-latest'),
      // provider.chat('gemini-1.0-pro'),
    ],
    embeddingModels: [provider.textEmbeddingModel('text-embedding-004')],
  },
  timeout: 10000,
  customAssertions: {
    skipUsage: true,
    errorValidator: (error: APICallError) => {
      console.log(error);
      expect((error.data as GoogleErrorData).error.message).match(
        /models\/no\-such\-model is not found/,
      );
    },
  },
})();
