import {
  InvalidResponseDataError,
  type LanguageModelV3StreamPart,
} from '@ai-sdk/provider';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createAnthropic } from './anthropic-provider';

function readFixture(name: string): string {
  return readFileSync(
    new URL(`./__fixtures__/${name}.chunks.txt`, import.meta.url),
    'utf8',
  );
}

function createModel(fixtureName: string) {
  return createAnthropic({
    apiKey: 'test-api-key',
    fetch: async () =>
      new Response(
        readFixture(fixtureName)
          .trim()
          .split('\n')
          .map(line => {
            const event = JSON.parse(line) as { type: string };
            return `event: ${event.type}\ndata: ${line}\n\n`;
          })
          .join(''),
        { headers: { 'content-type': 'text/event-stream' } },
      ),
  })('claude-sonnet-4-20250514');
}

async function parseFixture(fixtureName: string) {
  const { stream } = await createModel(fixtureName).doStream({
    prompt: [
      {
        role: 'user',
        content: [{ type: 'text', text: 'Use the lookup tool.' }],
      },
    ],
    tools: [
      {
        type: 'function',
        name: 'lookup',
        inputSchema: {
          type: 'object',
          properties: { value: { type: 'string' } },
          required: ['value'],
          additionalProperties: false,
        },
      },
    ],
  });

  const parts: LanguageModelV3StreamPart[] = [];
  const reader = stream.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      return parts;
    }
    parts.push(value);
  }
}

describe('issue #18331', () => {
  it('errors when a different message starts while the previous message is open', async () => {
    const parts = await parseFixture('issue-18331-spliced-message-start');

    expect(
      parts.some(
        part =>
          part.type === 'error' &&
          InvalidResponseDataError.isInstance(part.error),
      ),
    ).toBe(true);
  });

  it('ignores a duplicate message_start for the open message', async () => {
    const parts = await parseFixture('issue-18331-duplicate-message-start');

    expect(
      parts
        .filter(part => part.type === 'response-metadata')
        .map(part => part.id),
    ).toEqual(['msg_duplicate']);
    expect(
      parts.find(part => part.type === 'finish')?.usage.inputTokens.total,
    ).toBe(10);
  });
});
