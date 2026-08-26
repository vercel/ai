import { convertReadableStreamToArray } from '@ai-sdk/provider-utils/test';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createGoogleGenerativeAI } from './google-provider';

const generateFixture = readFileSync(
  new URL('./__fixtures__/issue-19758-prompt-block.json', import.meta.url),
  'utf8',
);
const streamFixture = readFileSync(
  new URL(
    './__fixtures__/issue-19758-prompt-block.chunks.txt',
    import.meta.url,
  ),
  'utf8',
);

const provider = createGoogleGenerativeAI({
  apiKey: 'test-api-key',
  fetch: async input => {
    const isStream = String(input).includes(':streamGenerateContent');

    return new Response(
      isStream ? `data: ${streamFixture.trim()}\n\n` : generateFixture,
      {
        status: 200,
        headers: {
          'content-type': isStream ? 'text/event-stream' : 'application/json',
        },
      },
    );
  },
});

const model = provider('gemini-3.7-flash');
const prompt = [
  {
    role: 'user' as const,
    content: [
      {
        type: 'text' as const,
        text: 'Prompt blocked by Google before candidate generation.',
      },
    ],
  },
];

describe('Google prompt-level safety blocks', () => {
  it('surfaces a non-streaming block as content-filter with prompt feedback', async () => {
    const result = await model.doGenerate({ prompt });

    expect(result.content).toEqual([]);
    expect(result.finishReason).toBe('content-filter');
    expect(result.providerMetadata?.google.promptFeedback).toEqual({
      blockReason: 'PROHIBITED_CONTENT',
    });
  });

  it('surfaces a streaming block as content-filter with prompt feedback', async () => {
    const { stream } = await model.doStream({ prompt });
    const events = await convertReadableStreamToArray(stream);
    const finish = events.find(event => event.type === 'finish');

    expect(finish).toMatchObject({
      type: 'finish',
      finishReason: 'content-filter',
      providerMetadata: {
        google: {
          promptFeedback: {
            blockReason: 'PROHIBITED_CONTENT',
          },
        },
      },
    });
  });
});
