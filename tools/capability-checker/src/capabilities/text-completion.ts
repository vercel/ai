import { generateText, streamText } from 'ai';
import { expect, it } from 'vitest';
import { describeIfCapability } from '../capability-test-utils';
import type { TestFunction } from './index';

export const run: TestFunction<'textCompletion'> = ({
  model,
  capabilities,
  skipUsage,
}) => {
  describeIfCapability(
    capabilities,
    ['textCompletion'],
    'Text Generation',
    () => {
      it('should generate text', async () => {
        const result = await generateText({
          model,
          prompt: 'Write a haiku about programming.',
        });

        expect(result.text).toBeTruthy();
        if (!skipUsage) {
          expect(result.usage?.totalTokens).toBeGreaterThan(0);
        }
      });

      it('should generate text with system prompt', async () => {
        const result = await generateText({
          model,
          messages: [
            {
              role: 'system',
              content: 'You are a helpful assistant.',
            },
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: 'Write a haiku about programming.',
                },
              ],
            },
          ],
        });

        expect(result.text).toBeTruthy();
        expect(result.usage?.totalTokens).toBeGreaterThan(0);
      });

      it('should stream text', async () => {
        const result = streamText({
          model,
          prompt: 'Count from 1 to 5 slowly.',
        });

        const chunks: string[] = [];
        for await (const chunk of result.textStream) {
          chunks.push(chunk);
        }

        expect(chunks.length).toBeGreaterThan(0);
        if (!skipUsage) {
          expect((await result.usage)?.totalTokens).toBeGreaterThan(0);
        }
      });
    },
  );
};
