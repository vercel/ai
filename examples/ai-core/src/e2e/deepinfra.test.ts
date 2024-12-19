import 'dotenv/config';
import { describe, it, expect, vi } from 'vitest';
import { createDeepInfra, DeepInfraErrorData } from '@ai-sdk/deepinfra';
import { z } from 'zod';
import {
  generateText,
  generateObject,
  streamText,
  streamObject,
  embed,
  embedMany,
  APICallError,
} from 'ai';
import fs from 'fs';

const LONG_TEST_MILLIS = 30000;

// Model variants to test against
const MODEL_VARIANTS = {
  chat: [
    // 'google/codegemma-7b-it', // no tools, objects, or images
    // 'google/gemma-2-9b-it', // no tools, objects, or images
    'meta-llama/Llama-3.2-11B-Vision-Instruct', // no tools, *does* support images
    // 'meta-llama/Llama-3.2-90B-Vision-Instruct', // no tools, *does* support images
    // 'meta-llama/Llama-3.3-70B-Instruct-Turbo', // no image input
    // 'meta-llama/Llama-3.3-70B-Instruct', // no image input
    // 'meta-llama/Meta-Llama-3.1-405B-Instruct', // no image input
    // 'meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo', // no image input
    // 'meta-llama/Meta-Llama-3.1-70B-Instruct', // no image input
    // 'meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo', // no *streaming* tools, no image input
    // 'meta-llama/Meta-Llama-3.1-8B-Instruct', // no image input
    // 'microsoft/WizardLM-2-8x22B', // no objects, tools, or images
    'mistralai/Mixtral-8x7B-Instruct-v0.1', // no *streaming* tools, no image input
    // 'nvidia/Llama-3.1-Nemotron-70B-Instruct', // no images
    // 'Qwen/Qwen2-7B-Instruct', // no tools, no image input
    'Qwen/Qwen2.5-72B-Instruct', // no images
    // 'Qwen/Qwen2.5-Coder-32B-Instruct', // no tool calls, no image input
    // 'Qwen/QwQ-32B-Preview', // no tools, no image input
  ],
  completion: [
    'meta-llama/Meta-Llama-3.1-8B-Instruct',
    'Qwen/Qwen2-7B-Instruct',
  ],
  embedding: [
    'BAAI/bge-base-en-v1.5',
    'intfloat/e5-base-v2',
    'sentence-transformers/all-mpnet-base-v2',
  ],
} as const;

describe('DeepInfra E2E Tests', () => {
  vi.setConfig({ testTimeout: LONG_TEST_MILLIS });
  const provider = createDeepInfra();

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
            description: 'A calculator tool',
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
            description: 'A calculator tool',
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
      expect((await result.usage).totalTokens).toBeGreaterThan(0);
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
      expect((await result.usage).totalTokens).toBeGreaterThan(0);
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
        expect(
          ((error as APICallError).data as DeepInfraErrorData).error.message ===
            'The model `no-such-model` does not exist',
        ).toBe(true);
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
        expect(
          ((error as APICallError).data as DeepInfraErrorData).error.message ===
            'The model `no-such-model` does not exist',
        ).toBe(true);
      }
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
      expect(result.usage.tokens).toBeGreaterThan(0);
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
      expect(result.usage.tokens).toBeGreaterThan(0);
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
  });
});
