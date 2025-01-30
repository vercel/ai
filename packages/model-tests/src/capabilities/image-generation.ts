import { experimental_generateImage as generateImage } from 'ai';
import { expect, it } from 'vitest';
import { describeIfCapability } from '../capability-test-utils';
import type { TestFunction } from './index';

export const run: TestFunction<'imageGeneration'> = ({
  model,
  capabilities,
}) => {
  describeIfCapability(
    capabilities,
    ['imageGeneration'],
    'Image Generation',
    () => {
      it('should generate an image', async () => {
        const result = await generateImage({
          model,
          prompt: 'A cute cartoon cat',
        });

        // Verify we got a base64 string back
        expect(result.image.base64).toBeTruthy();
        expect(typeof result.image.base64).toBe('string');

        // Check the decoded length is reasonable (at least 10KB)
        const decoded = Buffer.from(result.image.base64, 'base64');
        expect(decoded.length).toBeGreaterThan(10 * 1024);
      });
    },
  );
};
