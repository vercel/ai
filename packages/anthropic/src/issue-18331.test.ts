import { InvalidResponseDataError } from '@ai-sdk/provider';
import { createTestServer } from '@ai-sdk/test-server/with-vitest';
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

describe('issue 18331', () => {
  const server = createTestServer({
    'https://api.anthropic.com/v1/messages': {},
  });
  const model = createAnthropic({ apiKey: 'test-api-key' })(
    'claude-sonnet-4-20250514',
  );

  function prepareFixture(filename: string) {
    const chunks = fs
      .readFileSync(`src/__fixtures__/${filename}.chunks.txt`, 'utf8')
      .trimEnd()
      .split('\n')
      .map(line => `data: ${line}\n\n`);

    server.urls['https://api.anthropic.com/v1/messages'].response = {
      type: 'stream-chunks',
      chunks,
    };
  }

  it('fails a different message_start while the previous message is open', async () => {
    prepareFixture('issue-18331-spliced-message-start');

    const { stream } = await model.doStream({ prompt });
    const parts = await convertReadableStreamToArray(stream);

    expect(
      parts.some(
        part =>
          part.type === 'error' &&
          InvalidResponseDataError.isInstance(part.error),
      ),
    ).toBe(true);
    expect(parts.filter(part => part.type === 'response-metadata')).toEqual([
      expect.objectContaining({ id: 'msg_first' }),
    ]);
    expect(parts.some(part => part.type === 'finish')).toBe(false);
    expect(parts.some(part => part.type === 'tool-call')).toBe(false);
  });

  it('ignores a duplicate message_start for the same open message', async () => {
    prepareFixture('issue-18331-duplicate-message-start');

    const { stream } = await model.doStream({ prompt });
    const parts = await convertReadableStreamToArray(stream);

    expect(parts.filter(part => part.type === 'response-metadata')).toEqual([
      expect.objectContaining({ id: 'msg_duplicate' }),
    ]);
    expect(parts.find(part => part.type === 'finish')).toMatchObject({
      usage: { inputTokens: 10, outputTokens: 2, totalTokens: 12 },
    });
  });

  it('keeps sequential messages separated by message_stop valid', async () => {
    prepareFixture('issue-18331-sequential-messages');

    const { stream } = await model.doStream({ prompt });
    const parts = await convertReadableStreamToArray(stream);

    expect(
      parts
        .filter(part => part.type === 'response-metadata')
        .map(part => part.id),
    ).toEqual(['msg_first', 'msg_second']);
    expect(parts.filter(part => part.type === 'finish')).toHaveLength(2);
    expect(parts.filter(part => part.type === 'error')).toHaveLength(0);
  });
});
