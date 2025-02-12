import { expect } from 'vitest';
import { CerebrasErrorData, cerebras as provider } from '@ai-sdk/cerebras';
import {
  createLanguageModelWithCapabilities,
  createFeatureTestSuite,
} from '../feature-test-suite';
import type { ModelConfig } from '../types/model';
import { APICallError } from 'ai';
import 'dotenv/config';

export default function runTests(modelConfig: ModelConfig) {
  switch (modelConfig.modelType) {
    case 'language': {
      const model = provider.chat(modelConfig.modelId);
      createFeatureTestSuite({
        name: 'Cerebras',
        timeout: 30000,
        errorValidators: {
          language: (error: APICallError) => {
            expect((error.data as CerebrasErrorData).message).toMatch(
              /not exist/i,
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
