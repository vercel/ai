import 'dotenv/config';
import { describe, it, expect, vi } from 'vitest';
import { fireworks as provider, FireworksErrorData } from '@ai-sdk/fireworks';
import { z } from 'zod';
import {
  generateText,
  generateObject,
  streamText,
  streamObject,
  embed,
  embedMany,
} from 'ai';
import { APICallError } from '@ai-sdk/provider';
import fs from 'fs';

const LONG_TEST_MILLIS = 10000;

// Model variants to test against
const MODEL_VARIANTS = {
  chat: [
    'accounts/fireworks/models/firefunction-v2',
    'accounts/fireworks/models/llama-v3p3-70b-instruct',
    'accounts/fireworks/models/mixtral-8x7b-instruct',
    'accounts/fireworks/models/qwen2p5-72b-instruct',
  ],
  completion: [
    'accounts/fireworks/models/llama-v3-8b-instruct',
    'accounts/fireworks/models/llama-v2-34b-code',
  ],
  embedding: ['nomic-ai/nomic-embed-text-v1.5'],
} as const;

describe('Fireworks E2E Tests', () => {
  vi.setConfig({ testTimeout: LONG_TEST_MILLIS });

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
        expect(((error as APICallError).data as FireworksErrorData).error).toBe(
          'Model not found, inaccessible, and/or not deployed',
        );
      }
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
      expect((await result.usage)?.totalTokens).toBeGreaterThan(0);
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
      expect((await result.usage)?.totalTokens).toBeGreaterThan(0);
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
        expect(((error as APICallError).data as FireworksErrorData).error).toBe(
          'Model not found, inaccessible, and/or not deployed',
        );
      }
    });

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
                image: fs
                  .readFileSync('./data/comic-cat.png')
                  .toString('base64'),
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
                image: fs
                  .readFileSync('./data/comic-cat.png')
                  .toString('base64'),
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

  describe.each(MODEL_VARIANTS.embedding)('Embedding Model: %s', modelId => {
    const model = provider.textEmbeddingModel(modelId);

    it('should generate single embedding', async () => {
      const result = await embed({
        model,
        value: 'This is a test sentence for embedding.',
      });

      expect(Array.isArray(result.embedding)).toBe(true);
      expect(result.embedding.length).toBeGreaterThan(0);
      expect(result.usage?.tokens).toBeGreaterThan(0);
    });

    it('should generate multiple embeddings', async () => {
      const result = await embedMany({
        model,
        values: [
          'First test sentence.',
          'Second test sentence.',
          'Third test sentence.',
        ],
      });

      expect(Array.isArray(result.embeddings)).toBe(true);
      expect(result.embeddings.length).toBe(3);
      expect(result.usage?.tokens).toBeGreaterThan(0);
    });
  });

  describe.each(MODEL_VARIANTS.completion)('Completion Model: %s', modelId => {
    const model = provider(modelId);

    it('should generate text', async () => {
      const result = await generateText({
        model,
        prompt: 'Complete this code: function fibonacci(n) {',
      });

      expect(result.text).toBeTruthy();
      expect(result.usage?.totalTokens).toBeGreaterThan(0);
    });

    it('should stream text', async () => {
      const result = streamText({
        model,
        prompt: 'Write a Python function that sorts a list:',
      });

      const chunks: string[] = [];
      for await (const chunk of result.textStream) {
        chunks.push(chunk);
      }

      expect(chunks.length).toBeGreaterThan(0);
      expect((await result.usage)?.totalTokens).toBeGreaterThan(0);
    });

    it('should throw error on generate text attempt with invalid model ID', async () => {
      const invalidModel = provider('no-such-model');

      try {
        await generateText({
          model: invalidModel,
          prompt: 'This should fail',
        });
        // If we reach here, the test should fail
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBeInstanceOf(APICallError);
        expect(((error as APICallError).data as FireworksErrorData).error).toBe(
          'Model not found, inaccessible, and/or not deployed',
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
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBeInstanceOf(APICallError);
        expect(((error as APICallError).data as FireworksErrorData).error).toBe(
          'Model not found, inaccessible, and/or not deployed',
        );
      }
    });
  });
});
