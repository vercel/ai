import { generateText, streamText } from 'ai';
import { expect, it } from 'vitest';
import fs from 'fs';
import { describeIfCapability } from '../capability-test-utils';
import type { TestFunction } from './index';

export const run: TestFunction<'imageInput'> = ({
  model,
  capabilities,
  skipUsage,
}) => {
  describeIfCapability(capabilities, ['imageInput'], 'Image Input', () => {
    it('should generate text with image URL input', async () => {
      const result = await generateText({
        model,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Describe the image in detail.',
              },
              {
                type: 'image',
                image:
                  'https://github.com/vercel/ai/blob/main/examples/ai-core/data/comic-cat.png?raw=true',
              },
            ],
          },
        ],
      });

      expect(result.text).toBeTruthy();
      expect(result.text.toLowerCase()).toContain('cat');
      if (!skipUsage) {
        expect(result.usage?.totalTokens).toBeGreaterThan(0);
      }
    });

    it('should generate text with image input', async () => {
      const result = await generateText({
        model,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Describe the image in detail.',
              },
              {
                type: 'image',
                image: fs.readFileSync('./data/comic-cat.png'),
              },
            ],
          },
        ],
      });

      expect(result.text.toLowerCase()).toContain('cat');
      if (!skipUsage) {
        expect(result.usage?.totalTokens).toBeGreaterThan(0);
      }
    });

    it('should stream text with image URL input', async () => {
      const result = streamText({
        model,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Describe the image in detail.',
              },
              {
                type: 'image',
                image:
                  'https://github.com/vercel/ai/blob/main/examples/ai-core/data/comic-cat.png?raw=true',
              },
            ],
          },
        ],
      });

      const chunks: string[] = [];
      for await (const chunk of result.textStream) {
        chunks.push(chunk);
      }

      const fullText = chunks.join('');
      expect(chunks.length).toBeGreaterThan(0);
      expect(fullText.toLowerCase()).toContain('cat');
      expect((await result.usage)?.totalTokens).toBeGreaterThan(0);
    });

    it('should stream text with image input', async () => {
      const result = streamText({
        model,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Describe the image in detail.',
              },
              {
                type: 'image',
                image: fs.readFileSync('./data/comic-cat.png'),
              },
            ],
          },
        ],
      });

      const chunks: string[] = [];
      for await (const chunk of result.textStream) {
        chunks.push(chunk);
      }

      const fullText = chunks.join('');
      expect(fullText.toLowerCase()).toContain('cat');
      expect(chunks.length).toBeGreaterThan(0);
      if (!skipUsage) {
        expect((await result.usage)?.totalTokens).toBeGreaterThan(0);
      }
    });
  });
};
