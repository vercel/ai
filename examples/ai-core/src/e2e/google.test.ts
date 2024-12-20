import 'dotenv/config';
import { describe, it, expect, vi } from 'vitest';
import {
  createGoogleGenerativeAI,
  GoogleGenerativeAIProviderMetadata,
} from '@ai-sdk/google';
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

const MODEL_VARIANTS = {
  chat: [
    'gemini-1.5-flash-latest',
    // Gemini 2.0 and Pro models have low quota limits and may require billing enabled.
    // 'gemini-2.0-flash-exp',
    // 'gemini-1.5-pro-latest',
    // 'gemini-1.0-pro',
  ],
  embedding: ['text-embedding-004'],
} as const;

const verifyGroundingMetadata = (groundingMetadata: any) => {
  expect(Array.isArray(groundingMetadata?.webSearchQueries)).toBe(true);
  expect(groundingMetadata?.webSearchQueries?.length).toBeGreaterThan(0);

  // Verify search entry point exists
  expect(groundingMetadata?.searchEntryPoint?.renderedContent).toBeDefined();

  // Verify grounding supports
  expect(Array.isArray(groundingMetadata?.groundingSupports)).toBe(true);
  const support = groundingMetadata?.groundingSupports?.[0];
  expect(support?.segment).toBeDefined();
  expect(Array.isArray(support?.groundingChunkIndices)).toBe(true);
  expect(Array.isArray(support?.confidenceScores)).toBe(true);
};

const verifySafetyRatings = (safetyRatings: any[]) => {
  expect(Array.isArray(safetyRatings)).toBe(true);
  expect(safetyRatings?.length).toBeGreaterThan(0);

  // Verify each safety rating has required properties
  safetyRatings?.forEach(rating => {
    expect(rating.category).toBeDefined();
    expect(rating.probability).toBeDefined();
    expect(typeof rating.probabilityScore).toBe('number');
    expect(rating.severity).toBeDefined();
    expect(typeof rating.severityScore).toBe('number');
  });
};

describe('Google E2E Tests', () => {
  vi.setConfig({ testTimeout: LONG_TEST_MILLIS });
  const provider = createGoogleGenerativeAI();

  describe.each(MODEL_VARIANTS.chat)('Chat Model: %s', modelId => {
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

    it('should include search grounding metadata in response when search grounding is enabled', async () => {
      const model = provider(modelId, {
        useSearchGrounding: true,
      });

      const result = await generateText({
        model,
        prompt: 'What is the current population of Tokyo?',
      });

      expect(result.text).toBeTruthy();
      expect(result.text.toLowerCase()).toContain('tokyo');
      expect(result.usage?.totalTokens).toBeGreaterThan(0);

      const metadata = result.experimental_providerMetadata?.google as
        | GoogleGenerativeAIProviderMetadata
        | undefined;
      verifyGroundingMetadata(metadata?.groundingMetadata);
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

    it('should include search grounding metadata when streaming with search grounding enabled', async () => {
      const model = provider(modelId, {
        useSearchGrounding: true,
      });

      const result = streamText({
        model,
        prompt: 'What is the current population of Tokyo?',
      });

      const chunks: string[] = [];
      for await (const chunk of result.textStream) {
        chunks.push(chunk);
      }

      const metadata = (await result.experimental_providerMetadata)?.google as
        | GoogleGenerativeAIProviderMetadata
        | undefined;

      const completeText = chunks.join('');
      expect(completeText).toBeTruthy();
      expect(completeText.toLowerCase()).toContain('tokyo');
      expect((await result.usage)?.totalTokens).toBeGreaterThan(0);

      verifyGroundingMetadata(metadata?.groundingMetadata);
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

    it('should include safety ratings in response when search grounding is enabled', async () => {
      const model = provider(modelId, {
        useSearchGrounding: true,
      });

      const result = await generateText({
        model,
        prompt: 'What is the current population of Tokyo?',
      });

      const metadata = result.experimental_providerMetadata?.google as
        | GoogleGenerativeAIProviderMetadata
        | undefined;
      verifySafetyRatings(metadata?.safetyRatings ?? []);
    });

    it('should include safety ratings when streaming with search grounding enabled', async () => {
      const model = provider(modelId, {
        useSearchGrounding: true,
      });

      const result = streamText({
        model,
        prompt: 'What is the current population of Tokyo?',
      });

      for await (const _ of result.textStream) {
        // consume the stream
      }

      const metadata = (await result.experimental_providerMetadata)?.google as
        | GoogleGenerativeAIProviderMetadata
        | undefined;

      verifySafetyRatings(metadata?.safetyRatings ?? []);
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
    });
  });
});
