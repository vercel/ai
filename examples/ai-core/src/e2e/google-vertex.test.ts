import 'dotenv/config';
import { describe, it, expect, vi } from 'vitest';
import { createVertex } from '@ai-sdk/google-vertex';
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
import { generateAuthToken } from '@ai-sdk/google-vertex/auth-edge';

const LONG_TEST_MILLIS = 10000;

// Model variants to test against
const MODEL_VARIANTS = {
  chat: [
    'gemini-1.5-flash',
    // Pro models have low quota limits and can only be used if you have a
    // Google Cloud account with appropriate billing enabled.
    // 'gemini-1.5-pro-001',
    // 'gemini-1.0-pro-001',
  ],
  embedding: ['textembedding-gecko', 'textembedding-gecko-multilingual'],
} as const;

describe('Google Vertex E2E Tests', () => {
  vi.setConfig({ testTimeout: LONG_TEST_MILLIS });
  const provider = createVertex({
    project: process.env.GOOGLE_VERTEX_PROJECT,
    location: process.env.GOOGLE_VERTEX_LOCATION,
    headers: async () => ({
      Authorization: `Bearer ${await generateAuthToken()}`,
    }),
  });

  describe.each(MODEL_VARIANTS.chat)('Chat Model: %s', modelId => {
    it('should generate text with search grounding', async () => {
      const model = provider(modelId, {
        useSearchGrounding: true,
      });

      const result = await generateText({
        model,
        prompt: 'What is the capital of France?',
      });

      expect(result.text).toBeTruthy();
      expect(result.text.toLowerCase()).toContain('paris');
      expect(result.usage?.totalTokens).toBeGreaterThan(0);
    });

    it('should generate text', async () => {
      const model = provider(modelId);
      const result = await generateText({
        model,
        prompt: 'Write a haiku about programming.',
      });

      expect(result.text).toBeTruthy();
      expect(result.usage?.totalTokens).toBeGreaterThan(0);
    });

    it('should generate text with tool calls', async () => {
      const model = provider(modelId);
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

      expect(result.toolCalls?.[0]).toMatchObject({
        toolName: 'calculator',
        args: { expression: '2+2' },
      });
      expect(result.toolResults?.[0].result).toBe('4');
      expect(result.usage?.totalTokens).toBeGreaterThan(0);
    });

    it('should generate text with PDF input', async () => {
      const model = provider(modelId);
      const result = await generateText({
        model,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Summarize the contents of this PDF.' },
              {
                type: 'file',
                data: fs.readFileSync('./data/ai.pdf').toString('base64'),
                mimeType: 'application/pdf',
              },
            ],
          },
        ],
      });

      expect(result.text).toBeTruthy();
      expect(result.text.toLowerCase()).toContain('embedding');
      expect(result.usage?.totalTokens).toBeGreaterThan(0);
    });

    it('should generate object', async () => {
      const model = provider(modelId);
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
      const model = provider(modelId);
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
      const model = provider(modelId);
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

      // Find tool results and validate calculations
      const toolResults = parts.filter(part => part.type === 'tool-result');
      expect(toolResults).toHaveLength(2);

      // Validate 5+7=12
      expect(toolResults[0]).toMatchObject({
        type: 'tool-result',
        toolName: 'calculator',
        args: { expression: '5+7' },
        result: '12',
      });

      // Validate 3*4=12
      expect(toolResults[1]).toMatchObject({
        type: 'tool-result',
        toolName: 'calculator',
        args: { expression: '3*4' },
        result: '12',
      });

      expect((await result.usage)?.totalTokens).toBeGreaterThan(0);
    });

    it('should stream object', async () => {
      const model = provider(modelId);
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

      // Get the final part which should contain the complete object
      const finalPart = parts[parts.length - 1];

      // Verify array has exactly 3 characters as requested
      expect(finalPart.characters).toHaveLength(3);

      // Verify each character has the required properties with meaningful content
      finalPart.characters?.forEach(character => {
        expect(character).toBeDefined();

        // Name checks
        expect(character?.name).toBeDefined();
        expect(character?.name?.length).toBeGreaterThan(2);

        // Class checks
        expect(character?.class).toBeDefined();
        expect(character?.class?.length).toBeGreaterThan(2);

        // Description checks
        expect(character?.description).toBeDefined();
        expect(character?.description?.length).toBeGreaterThan(20);
        expect(character?.description?.endsWith('.')).toBe(true);
      });

      expect((await result.usage)?.totalTokens).toBeGreaterThan(0);
    });

    it('should generate text with image URL input', async () => {
      const model = provider(modelId);
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
      const model = provider(modelId);
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

      expect(result.text).toBeTruthy();
      expect(result.text.toLowerCase()).toContain('cat');
      expect(result.usage?.totalTokens).toBeGreaterThan(0);
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
});
