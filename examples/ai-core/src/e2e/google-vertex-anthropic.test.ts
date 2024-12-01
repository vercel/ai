import 'dotenv/config';
import { describe, it, expect, vi } from 'vitest';
import { createGoogleVertexAnthropic as createVertexAnthropicNode } from '@ai-sdk/google-vertex/anthropic';
import { createGoogleVertexAnthropic as createVertexAnthropicEdge } from '@ai-sdk/google-vertex/anthropic/edge';
import { generateText, streamText } from 'ai';
import fs from 'fs';

const LONG_TEST_MILLIS = 10000;

// Model variants to test against
const MODEL_VARIANTS = {
  chat: [
    'claude-3-5-sonnet@20240620',
    // 'claude-3-5-sonnet-v2@20241022',
    // 'claude-3-5-haiku@20241022'
  ],
} as const;

// Define runtime variants
const RUNTIME_VARIANTS = {
  edge: {
    name: 'Edge Runtime',
    createVertexAnthropic: createVertexAnthropicEdge,
  },
  node: {
    name: 'Node Runtime',
    createVertexAnthropic: createVertexAnthropicNode,
  },
} as const;

describe.each(Object.values(RUNTIME_VARIANTS))(
  'Vertex Anthropic E2E Tests - $name',
  ({ createVertexAnthropic }) => {
    vi.setConfig({ testTimeout: LONG_TEST_MILLIS });

    const provider = createVertexAnthropic({
      project: process.env.GOOGLE_VERTEX_PROJECT!,
      location: process.env.GOOGLE_VERTEX_LOCATION ?? 'us-central1',
    });

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
                { type: 'text', text: 'Write a haiku about programming.' },
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
        expect((await result.usage)?.totalTokens).toBeGreaterThan(0);
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
        expect(result.usage?.totalTokens).toBeGreaterThan(0);
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

      // it('should support cache control', async () => {
      //   const result = await generateText({
      //     model: provider(modelId, { cacheControl: true }),
      //     messages: [
      //       {
      //         role: 'user',
      //         content: [{ type: 'text', text: 'Hello' }],
      //         providerMetadata: {
      //           anthropic: {
      //             cacheControl: { type: 'ephemeral' },
      //           },
      //         },
      //       },
      //     ],
      //   });

      //   expect(result.text).toBeTruthy();
      //   expect(
      //     result.providerMetadata?.anthropic?.cacheCreationInputTokens,
      //   ).toBeDefined();
      // });
    });
  },
);
