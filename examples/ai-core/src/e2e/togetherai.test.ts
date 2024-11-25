import 'dotenv/config';
import { describe, it, expect, vi } from 'vitest';
import { createTogetherAI } from '@ai-sdk/togetherai';
import { z } from 'zod';
import {
  generateText,
  generateObject,
  streamText,
  streamObject,
  embed,
  embedMany,
} from 'ai';
import fs from 'fs';

const LONG_TEST_MILLIS = 10000;

// Model variants to test against
const MODEL_VARIANTS = {
  chat: [
    'meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo',
    'mistralai/Mistral-7B-Instruct-v0.1', // tool-call supported, our generateObject test script works
    'google/gemma-2b-it',
    'meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo',
    'mistralai/Mixtral-8x7B-Instruct-v0.1',
    'Qwen/Qwen2.5-72B-Instruct-Turbo',
    'databricks/dbrx-instruct',
  ],
  completion: [
    'codellama/CodeLlama-34b-Instruct-hf',
    'Qwen/Qwen2.5-Coder-32B-Instruct',
  ],
  embedding: [
    'togethercomputer/m2-bert-80M-8k-retrieval',
    'BAAI/bge-base-en-v1.5',
  ],
} as const;

describe('TogetherAI E2E Tests', () => {
  vi.setConfig({ testTimeout: LONG_TEST_MILLIS });
  const provider = createTogetherAI();

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

    it.skipIf(
      [
        'google/gemma-2b-it',
        'meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo',
        'Qwen/Qwen2.5-72B-Instruct-Turbo',
        'databricks/dbrx-instruct',
      ].includes(modelId),
    )('should generate text with tool calls', async () => {
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

    it.skipIf(
      [
        'meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo',
        'google/gemma-2b-it',
        'meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo',
        'Qwen/Qwen2.5-72B-Instruct-Turbo',
        'databricks/dbrx-instruct',
      ].includes(modelId),
    )('should generate object', async () => {
      // NOTE(shaper): Works with 'mistralai/Mistral-7B-Instruct-v0.1' in tool mode.

      // TODO(shaper): Not currently operational iterating on
      // https://docs.together.ai/docs/json-mode with 'meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo'
      // which is in the list of function-calling models https://docs.together.ai/docs/function-calling#supported-models
      // - 'json' mode produces JSON-markdown-formatted response which fails to parse
      // - 'tool' mode produces response wrapped with '<json>...</json>' which fails to parse

      const result = await generateObject({
        model,
        // mode: 'json',
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

    it.skipIf(
      [
        'google/gemma-2b-it',
        'meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo',
        'Qwen/Qwen2.5-72B-Instruct-Turbo',
        'databricks/dbrx-instruct',
      ].includes(modelId),
    )('should stream text with tool calls', async () => {
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
      // API docs show only `null` for `usage` in sample streaming chunk responses.
      // expect((await result.usage).totalTokens).toBeGreaterThan(0);
    });

    it.skipIf(
      [
        'meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo',
        'google/gemma-2b-it',
        'meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo',
        'Qwen/Qwen2.5-72B-Instruct-Turbo',
        'databricks/dbrx-instruct',
      ].includes(modelId),
    )('should stream object', async () => {
      // TODO(shaper): Not currently operational:
      // - 'meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo' reports type validation failure around `invalid_union`.
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
      // TogetherAI API does not return usage data.
      // expect((await result.usage).totalTokens).toBeGreaterThan(0);
    });

    it.skip('should generate text with image URL input', async () => {
      // NOTE(shaper): None of the models tested support image input.
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

    it.skip('should generate text with image input', async () => {
      // NOTE(shaper): None of the models tested support image input.
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

    it.skip('should stream text with image URL input', async () => {
      // NOTE(shaper): None of the models tested support image input.
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

    it.skip('should stream text with image input', async () => {
      // NOTE(shaper): None of the models tested support image input.
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
      // TogetherAI API does not return usage data.
      // expect(result.usage.tokens).toBeGreaterThan(0);
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
      // TogetherAI API does not return usage data.
      // expect(result.usage.tokens).toBeGreaterThan(0);
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
