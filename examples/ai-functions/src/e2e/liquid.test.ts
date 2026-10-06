import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { createLiquid } from '@ai-sdk/liquid';
import { experimental_decide } from 'ai';
import { describe, expect, it } from 'vitest';

describe.skipIf(!process.env.LIQUID_API_KEY)(
  'Liquid decision API (live)',
  () => {
    it.each(['data URL', 'base64 object'] as const)(
      'evaluates an image supplied as a %s',
      async encoding => {
        const image = await readFile(
          new URL('../../data/comic-cat.png', import.meta.url),
        );
        const base64 = image.toString('base64');
        const images = [
          encoding === 'data URL'
            ? `data:image/png;base64,${base64}`
            : { content_type: 'image/png', base64 },
        ];
        const context = 'Inspect the supplied image.';
        const state = { context, images };
        const originalState = structuredClone(state);
        const requests: Record<string, unknown>[] = [];
        const provider = createLiquid({
          fetch: async (url, init) => {
            expect(String(url)).toBe(
              'https://api.liquid.ai/decisions/v1/systemone',
            );
            expect(init?.method).toBe('POST');
            requests.push(JSON.parse(String(init?.body)));
            // Inspect the outgoing request, then send it to the real Liquid API.
            return globalThis.fetch(url, init);
          },
        });

        const result = await experimental_decide({
          model: provider.decisionModel('d1'),
          state,
          questions: {
            animal: {
              type: 'choice',
              instructions: 'Which animal appears in the image?',
              criteria: { cat: 'Cat', dog: 'Dog', other: 'Another animal' },
            },
            illustrated: {
              type: 'boolean',
              instructions: 'Is this an illustration rather than a photograph?',
            },
          },
          maxRetries: 0,
          abortSignal: AbortSignal.timeout(25_000),
        });

        expect(requests).toHaveLength(1);
        expect(requests[0].state).toEqual({ context });
        expect(requests[0].images).toEqual(images);
        expect(state).toEqual(originalState);
        expect(state.images).toBe(images);

        expect(result.answers.animal.choice).toBe('cat');
        expect(result.answers.animal.probabilities?.cat).toBeGreaterThan(0.9);
        expect(result.answers.illustrated.probability).toBeGreaterThan(0.9);
        expect(result.usage.inputTokens).toBeGreaterThan(0);
        expect(result.usage.outputTokens).toBe(0);
        const nativeUsage = (
          result.response.body as {
            usage: {
              input_tokens: number;
              output_tokens: number;
              cost: number;
            };
          }
        ).usage;
        expect(result.usage.inputTokens).toBe(nativeUsage.input_tokens);
        expect(result.usage.outputTokens).toBe(nativeUsage.output_tokens);
        expect(result.usage.totalTokens).toBe(
          nativeUsage.input_tokens + nativeUsage.output_tokens,
        );
        expect(nativeUsage.cost).toBeGreaterThan(0);
        expect(result.providerMetadata?.liquid.cost).toBe(nativeUsage.cost);
        expect(result.response.modelId).toBe('d1');
        expect(result.warnings).toEqual([]);
      },
      30_000,
    );
  },
);
