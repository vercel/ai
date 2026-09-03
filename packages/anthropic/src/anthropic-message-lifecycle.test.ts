import { InvalidResponseDataError } from '@ai-sdk/provider';
import { convertReadableStreamToArray } from '@ai-sdk/provider-utils/test';
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createAnthropic } from './anthropic-provider';

const prompt = [
  {
    role: 'user' as const,
    content: [{ type: 'text' as const, text: 'Hello' }],
  },
];

function createModel(fixtureName: string) {
  const chunks = fs
    .readFileSync(
      new URL(`./__fixtures__/${fixtureName}.chunks.txt`, import.meta.url),
      'utf8',
    )
    .trim()
    .split('\n')
    .map(line => `data: ${line}\n\n`)
    .join('');

  return createAnthropic({
    apiKey: 'test-api-key',
    fetch: async () =>
      new Response(chunks, {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      }),
  })('claude-3-haiku-20240307');
}

describe('Anthropic message lifecycle', () => {
  it('fails when a different message starts while the previous message is open', async () => {
    const { stream } = await createModel('spliced-message-start').doStream({
      prompt,
      tools: [
        {
          type: 'function',
          name: 'test-tool',
          inputSchema: {
            type: 'object',
            properties: { value: { type: 'string' } },
            required: ['value'],
            additionalProperties: false,
          },
        },
      ],
    });

    const parts = await convertReadableStreamToArray(stream);
    const errorParts = parts.filter(part => part.type === 'error');
    const responseIds = parts
      .filter(part => part.type === 'response-metadata')
      .map(part => part.id);

    expect(errorParts).toHaveLength(1);
    expect(
      InvalidResponseDataError.isInstance(errorParts[0]?.error),
    ).toBeTruthy();
    expect(responseIds).toEqual(['msg_first']);
    expect(
      parts.some(
        part => part.type === 'tool-call' && part.toolCallId === 'toolu_second',
      ),
    ).toBeFalsy();
    expect(parts.some(part => part.type === 'finish')).toBeFalsy();
  });

  it('ignores a duplicate message_start for the already-open message', async () => {
    const { stream } = await createModel('duplicate-message-start').doStream({
      prompt,
    });

    const parts = await convertReadableStreamToArray(stream);
    const responseMetadata = parts.filter(
      part => part.type === 'response-metadata',
    );

    expect(responseMetadata).toHaveLength(1);
    expect(parts.some(part => part.type === 'error')).toBeFalsy();
    expect(parts.some(part => part.type === 'finish')).toBeTruthy();
  });
});
