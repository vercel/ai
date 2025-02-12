import { expect } from 'vitest';
import { luma as provider, LumaErrorData } from '@ai-sdk/luma';
import { APICallError } from '@ai-sdk/provider';
import {
  createImageModelWithCapabilities,
  createFeatureTestSuite,
} from '../feature-test-suite';
import type { ModelConfig } from '../types/model';
import 'dotenv/config';

export default function runTests(modelConfig: ModelConfig) {
  switch (modelConfig.modelType) {
    case 'image': {
      const model = provider.image(modelConfig.modelId);
      createFeatureTestSuite({
        name: 'Luma',
        timeout: 30000,
        errorValidators: {
          image: (error: APICallError) => {
            expect((error.data as LumaErrorData).detail[0].msg).toMatch(
              /Input should be/i,
            );
          },
        },
        models: {
          image: [
            createImageModelWithCapabilities(
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
