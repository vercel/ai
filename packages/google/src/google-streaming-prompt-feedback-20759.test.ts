import { convertReadableStreamToArray } from '@ai-sdk/provider-utils/test';
import { describe, expect, it } from 'vitest';
import { createGoogleGenerativeAI } from './google-provider';
import { GoogleGenerativeAILanguageModel } from './google-generative-ai-language-model';

const usage = {
  promptTokenCount: 10,
  candidatesTokenCount: 0,
  totalTokenCount: 10,
};

const candidate = {
  content: { role: 'model', parts: [{ text: 'Fixture text.' }] },
  finishReason: 'STOP',
};

for (const adapter of ['public', 'vertex-internal'] as const) {
  describe(`${adapter} issue #20759`, () => {
    async function run(chunks: Array<unknown>) {
      const fixtureFetch: typeof fetch = async () =>
        new Response(
          chunks.map(chunk => `data: ${JSON.stringify(chunk)}\n\n`).join(''),
          { headers: { 'Content-Type': 'text/event-stream' } },
        );

      const model =
        adapter === 'public'
          ? createGoogleGenerativeAI({
              apiKey: 'fixture',
              fetch: fixtureFetch,
            })('gemini-3.7-flash')
          : new GoogleGenerativeAILanguageModel('gemini-3.7-flash', {
              provider: 'google.vertex',
              baseURL: 'https://fixture.invalid',
              headers: {},
              generateId: () => 'fixture-id',
              fetch: fixtureFetch,
            });

      const result = await model.doStream({
        prompt: [
          {
            role: 'user',
            content: [{ type: 'text', text: 'Fixture.' }],
          },
        ],
      });

      const parts = await convertReadableStreamToArray(result.stream);

      expect(parts.filter(part => part.type === 'error')).toEqual([]);
      const finish = parts.find(part => part.type === 'finish');
      expect(finish).toBeDefined();
      if (finish?.type !== 'finish') {
        throw new Error('Expected finish event');
      }

      return {
        parts,
        finish,
        metadata:
          finish.providerMetadata?.[adapter === 'public' ? 'google' : 'vertex'],
      };
    }

    it.each(['', 'BLOCK_REASON_UNSPECIFIED', 'BLOCKED_REASON_UNSPECIFIED'])(
      'does not classify default block reason %j as blocked',
      async blockReason => {
        const { finish } = await run([
          {
            candidates: [],
            promptFeedback: { blockReason },
            usageMetadata: usage,
          },
        ]);

        expect(finish.finishReason).toEqual({
          unified: 'other',
          raw: undefined,
        });
      },
    );

    it('retains feedback and trailing usage across separate chunks', async () => {
      const feedback = {
        blockReason: 'BLOCK_REASON_UNSPECIFIED',
        safetyRatings: [],
      };
      const finalUsage = {
        ...usage,
        candidatesTokenCount: 3,
        totalTokenCount: 13,
      };

      const { finish, metadata } = await run([
        { promptFeedback: feedback },
        { candidates: [candidate] },
        { usageMetadata: finalUsage },
      ]);

      expect(finish.finishReason.unified).toBe('stop');
      expect(metadata?.promptFeedback).toEqual(feedback);
      expect(metadata?.usageMetadata).toEqual(finalUsage);
      expect(finish.usage.outputTokens.total).toBe(3);
    });

    it('keeps an explicit prompt block terminal across later chunks', async () => {
      const { parts, finish, metadata } = await run([
        { promptFeedback: { blockReason: 'SAFETY' } },
        { candidates: [candidate] },
        {
          promptFeedback: { blockReason: 'BLOCK_REASON_UNSPECIFIED' },
          usageMetadata: usage,
        },
      ]);

      expect(finish.finishReason).toEqual({
        unified: 'content-filter',
        raw: 'SAFETY',
      });
      expect(metadata?.promptFeedback).toEqual({ blockReason: 'SAFETY' });
      expect(parts.filter(part => part.type === 'text-delta')).toEqual([]);
    });
  });
}
