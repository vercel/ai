import type { LanguageModelV4Prompt } from '@ai-sdk/provider';
import { convertReadableStreamToArray } from '@ai-sdk/provider-utils/test';
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createAnthropic } from './anthropic-provider';

const prompt: LanguageModelV4Prompt = [
  {
    role: 'user',
    content: [
      {
        type: 'text',
        text: 'Find the greatest common divisor of 1071 and 462 using the Euclidean algorithm.',
      },
    ],
  },
];

function createFixtureResponse(filename: string) {
  const chunks = fs
    .readFileSync(`src/__fixtures__/${filename}.chunks.txt`, 'utf8')
    .trimEnd()
    .split('\n')
    .map(line => `data: ${line}\n\n`);
  chunks.push('data: [DONE]\n\n');

  return new Response(chunks.join(''), {
    headers: { 'content-type': 'text/event-stream' },
  });
}

describe('issue #18238', () => {
  it('streams visible reasoning when top-level reasoning enables adaptive thinking', async () => {
    const provider = createAnthropic({
      apiKey: 'test-api-key',
      fetch: async (_input, init) => {
        if (typeof init?.body !== 'string') {
          throw new Error('Expected a JSON request body.');
        }

        const requestBody = JSON.parse(init.body) as {
          thinking?: { display?: string };
        };

        return createFixtureResponse(
          requestBody.thinking?.display === 'summarized'
            ? 'anthropic-claude-sonnet-5-reasoning-summarized'
            : 'anthropic-claude-sonnet-5-reasoning-generic',
        );
      },
    });

    const { stream } = await provider('claude-sonnet-5').doStream({
      prompt,
      reasoning: 'high',
    });

    const parts = await convertReadableStreamToArray(stream);
    const reasoningText = parts
      .filter(part => part.type === 'reasoning-delta')
      .map(part => part.delta)
      .join('');

    expect(
      reasoningText,
      'issue #18238: top-level reasoning produced no visible reasoning text',
    ).not.toBe('');
  });
});
