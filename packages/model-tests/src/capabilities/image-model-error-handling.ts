import { experimental_generateImage as generateImage } from 'ai';
import { it } from 'vitest';
import { describeIfCapability } from '../capability-test-utils';
import type { TestFunction } from './index';

export const run: TestFunction<'imageModelErrorHandling'> = ({
  model,
  capabilities,
  errorValidators,
}) => {
  if (!errorValidators?.image) {
    throw new Error(
      'imageErrorValidator is required for image model error handling tests',
    );
  }

  describeIfCapability(
    capabilities,
    ['imageModelErrorHandling'],
    'Image Model Error Handling',
    () => {
      it('should throw error on generate image attempt with invalid model ID', async () => {
        try {
          await generateImage({
            model,
            prompt: 'This should fail',
          });
        } catch (error: any) {
          errorValidators.image?.(error);
          return;
        }
        throw new Error('Expected an error to be thrown');
      });
    },
  );
};
