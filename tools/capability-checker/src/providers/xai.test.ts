import { expect } from 'vitest';
import { xai as provider, XaiErrorData } from '@ai-sdk/xai';
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
        name: 'xAI',
        timeout: 30000,
        errorValidators: {
          language: (error: APICallError) => {
            expect((error.data as XaiErrorData).code).toBe(
              'Some requested entity was not found',
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
