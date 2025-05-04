import { expect } from 'vitest';
import { luma as provider, LumaErrorData } from '@ai-sdk/luma';
import { APICallError } from '@ai-sdk/provider';
import {
  createFeatureTestSuite,
  createImageModelWithCapabilities,
} from './feature-test-suite';
import 'dotenv/config';

createFeatureTestSuite({
  name: 'Luma',
  models: {
    invalidImageModel: provider.imageModel('no-such-model'),
    imageModels: [
      createImageModelWithCapabilities(provider.imageModel('photon-flash-1')),
      createImageModelWithCapabilities(provider.imageModel('photon-1')),
    ],
  },
  timeout: 30000,
  customAssertions: {
    errorValidator: (error: APICallError) => {
      expect((error.data as LumaErrorData).detail[0].msg).toMatch(
        /Input should be/i,
      );
    },
  },
})();
