import { expect } from 'vitest';
import { deepseek as provider } from '@ai-sdk/deepseek';
import { APICallError } from 'ai';
import {
  createLanguageModelWithCapabilities,
  createFeatureTestSuite,
} from '../feature-test-suite';
import { DeepSeekErrorData } from '@ai-sdk/deepseek';
import type { ModelConfig } from '../types/model';
import 'dotenv/config';

export default function runTests(modelConfig: ModelConfig) {
  switch (modelConfig.modelType) {
    case 'language': {
      const model = provider.chat(modelConfig.modelId);
      createFeatureTestSuite({
        name: 'DeepSeek',
        timeout: 10000,
        errorValidators: {
          language: (error: APICallError) => {
            expect((error.data as DeepSeekErrorData).error.message).toBe(
              'Model Not Exist',
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
