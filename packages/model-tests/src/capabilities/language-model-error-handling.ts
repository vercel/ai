import { generateText, streamText } from 'ai';
import { it } from 'vitest';
import { describeIfCapability } from '../capability-test-utils';
import type { TestFunction } from './index';
import { fail } from 'assert';

export const run: TestFunction<'languageModelErrorHandling'> = ({
  model,
  capabilities,
  errorValidators,
}) => {
  if (!errorValidators?.language) {
    throw new Error('errorValidator is required for error handling tests');
  }

  describeIfCapability(
    capabilities,
    ['languageModelErrorHandling'],
    'Chat Model Error Handling',
    () => {
      it('should throw error on generate text attempt with invalid model ID', async () => {
        try {
          await generateText({
            model,
            prompt: 'This should fail',
          });
        } catch (error: any) {
          errorValidators.language?.(error);
          return;
        }
        throw new Error('Expected an error to be thrown');
      });

      it('should throw error on stream text attempt with invalid model ID', async () => {
        try {
          const result = streamText({
            model,
            prompt: 'This should fail',
          });

          // Try to consume the stream to trigger the error
          for await (const _ of result.textStream) {
            // Do nothing with the chunks
          }

          // If we reach here, the test should fail
          fail('Expected an error to be thrown');
        } catch (error: any) {
          errorValidators.language?.(error);
        }
      });
    },
  );
};
