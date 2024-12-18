import 'dotenv/config';
import { describe, it, expect, vi } from 'vitest';
import { createXai, XaiErrorData } from '@ai-sdk/xai';
import { z } from 'zod';
import { generateText, generateObject, streamText, streamObject } from 'ai';
import fs from 'fs';
import { APICallError } from '@ai-sdk/provider';

const LONG_TEST_MILLIS = 10000;

// Model variants to test against
const MODEL_VARIANTS = {
  chat: ['grok-beta', 'grok-2-1212'],
  vision: ['grok-vision-beta', 'grok-2-vision-1212'],
} as const;

describe('xAI E2E Tests', () => {
  vi.setConfig({ testTimeout: LONG_TEST_MILLIS });
  const provider = createXai();

  describe.each(MODEL_VARIANTS.chat)('Chat Model: %s', modelId => {
    const model = provider(modelId);

    it('should generate text', async () => {
      const result = await generateText({
        model,
        prompt: 'Write a haiku about programming.',
      });

      expect(result.text).toBeTruthy();
      expect(result.usage?.totalTokens).toBeGreaterThan(0);
    });

    it('should generate text with tool calls', async () => {
      const result = await generateText({
        model,
        prompt: 'What is 2+2? Use the calculator tool to compute this.',
        tools: {
          calculator: {
            parameters: z.object({
              expression: z
                .string()
                .describe('The mathematical expression to evaluate'),
            }),
            execute: async ({ expression }) => eval(expression).toString(),
          },
        },
      });

      expect(result.toolCalls).toBeTruthy();
      expect(result.toolResults).toBeTruthy();
      expect(result.usage?.totalTokens).toBeGreaterThan(0);
    });

    it('should generate object', async () => {
      const result = await generateObject({
        model,
        schema: z.object({
          title: z.string(),
          tags: z.array(z.string()),
        }),
        prompt: 'Generate metadata for a blog post about TypeScript.',
      });

      expect(result.object.title).toBeTruthy();
      expect(Array.isArray(result.object.tags)).toBe(true);
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
      expect((await result.usage)?.totalTokens).toBeGreaterThan(0);
    });

    it('should stream text with tool calls', async () => {
      const result = streamText({
        model,
        prompt: 'Calculate 5+7 and 3*4 using the calculator tool.',
        tools: {
          calculator: {
            parameters: z.object({
              expression: z.string(),
            }),
            execute: async ({ expression }) => eval(expression).toString(),
          },
        },
      });

      const parts = [];
      for await (const part of result.fullStream) {
        parts.push(part);
      }

      expect(parts.some(part => part.type === 'tool-call')).toBe(true);
    });

    it('should stream object', async () => {
      const result = streamObject({
        model,
        schema: z.object({
          characters: z.array(
            z.object({
              name: z.string(),
              class: z
                .string()
                .describe('Character class, e.g. warrior, mage, or thief.'),
              description: z.string(),
            }),
          ),
        }),
        prompt: 'Generate 3 RPG character descriptions.',
      });

      const parts = [];
      for await (const part of result.partialObjectStream) {
        parts.push(part);
      }

      expect(parts.length).toBeGreaterThan(0);
    });

    it('should throw error on generate text attempt with invalid model ID', async () => {
      const invalidModel = provider('no-such-model');

      try {
        await generateText({
          model: invalidModel,
          prompt: 'This should fail',
        });
        // If we reach here, the test should fail
        expect(true).toBe(false); // Force test to fail if no error is thrown
      } catch (error) {
        expect(error).toBeInstanceOf(APICallError);
        expect(((error as APICallError).data as XaiErrorData).code).toBe(
          'Some requested entity was not found',
        );
        expect(((error as APICallError).data as XaiErrorData).error).toContain(
          'does not exist or your team',
        );
      }
    });

    it('should throw error on stream text attempt with invalid model ID', async () => {
      const invalidModel = provider('no-such-model');

      try {
        const result = streamText({
          model: invalidModel,
          prompt: 'This should fail',
        });

        // Try to consume the stream to trigger the error
        for await (const _ of result.textStream) {
          // Do nothing with the chunks
        }

        // If we reach here, the test should fail
        expect(true).toBe(false); // Force test to fail if no error is thrown
      } catch (error) {
        expect(error).toBeInstanceOf(APICallError);
        expect(((error as APICallError).data as XaiErrorData).code).toBe(
          'Some requested entity was not found',
        );
        expect(((error as APICallError).data as XaiErrorData).error).toContain(
          'does not exist or your team',
        );
      }
    });
  });

  describe.each(MODEL_VARIANTS.vision)('Vision Model: %s', modelId => {
    const model = provider(modelId);

    it('should generate text with image URL input', async () => {
      const result = await generateText({
        model,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Describe the image in detail.' },
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
      expect(result.usage?.totalTokens).toBeGreaterThan(0);
    });

    it('should generate text with image input', async () => {
      const result = await generateText({
        model,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Describe the image in detail.' },
              {
                type: 'image',
                image: fs.readFileSync('./data/comic-cat.png'),
              },
            ],
          },
        ],
      });

      expect(result.text.toLowerCase()).toContain('cat');
      expect(result.text).toBeTruthy();
      expect(result.usage?.totalTokens).toBeGreaterThan(0);
    });

    it('should stream text with image URL input', async () => {
      const result = streamText({
        model,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Describe the image in detail.' },
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
              { type: 'text', text: 'Describe the image in detail.' },
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
      expect((await result.usage)?.totalTokens).toBeGreaterThan(0);
    });
  });

  // Note: xAI doesn't support embedding models, so we don't include those tests
  // The provider.textEmbeddingModel throws NoSuchModelError

  it('should throw error for embedding model', () => {
    expect(() => provider.textEmbeddingModel('grok-1')).toThrow();
  });
});
