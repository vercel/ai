import { expect } from 'vitest';
import {
  perplexity as provider,
  PerplexityErrorData,
} from '@ai-sdk/perplexity';
import { APICallError } from '@ai-sdk/provider';
import {
  createLanguageModelWithCapabilities,
  createFeatureTestSuite,
} from '../feature-test-suite';
import type { ModelConfig } from '../types/model';
import 'dotenv/config';

export default function runTests(modelConfig: ModelConfig) {
  switch (modelConfig.modelType) {
    case 'language': {
      const model = provider.chat(modelConfig.modelId);
      createFeatureTestSuite({
        name: 'perplexity',
        timeout: 30000,
        errorValidators: {
          language: (error: APICallError) => {
            expect((error.data as PerplexityErrorData).error.message).toMatch(
              /Invalid model/i,
            );
          },
        },
        models: {
          language: [
            createLanguageModelWithCapabilities(
              model,
              modelConfig.expectedCapabilities,
            ),
          ],
        },
      })();
      break;
    }
  }
}
