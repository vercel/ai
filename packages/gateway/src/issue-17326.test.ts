import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

type MessageStart = {
  type: 'message_start';
  message: {
    model: string;
    usage: {
      input_tokens: number;
      output_tokens: number;
    };
  };
};

type MessageDelta = {
  type: 'message_delta';
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
};

function readFixture(filename: string) {
  return fs.readFileSync(`src/__fixtures__/${filename}`, 'utf8');
}

function readEvent<T>(stream: string, eventType: string): T {
  const block = stream
    .split('\n\n')
    .find(block => block.startsWith(`event: ${eventType}\n`));

  if (block == null) {
    throw new Error(`Missing ${eventType} event`);
  }

  return JSON.parse(block.slice(block.indexOf('data: ') + 6)) as T;
}

describe('issue #17326', () => {
  it.each([
    ['xai/grok-4.5', 'issue-17326-xai-grok-4.5.chunks.txt', 84, 32],
    [
      'anthropic/claude-haiku-4.5',
      'issue-17326-anthropic-claude-haiku-4.5.chunks.txt',
      13,
      5,
    ],
  ])(
    'reports real usage in message_start for %s',
    (_model, filename, expectedInputTokens, expectedOutputTokens) => {
      const stream = readFixture(filename);
      const start = readEvent<MessageStart>(stream, 'message_start');
      const delta = readEvent<MessageDelta>(stream, 'message_delta');

      expect(delta.usage).toMatchObject({
        input_tokens: expectedInputTokens,
        output_tokens: expectedOutputTokens,
      });
      expect(start.message.usage.input_tokens).toBeGreaterThan(0);
      expect(start.message.usage.output_tokens).toBeGreaterThan(0);
    },
  );

  it('does not route count_tokens for xai/grok-4.5 to an Anthropic model lookup', () => {
    const response = readFixture('issue-17326-xai-grok-4.5-count-tokens.txt');
    const status = Number(response.match(/HTTP_STATUS:(\d+)/)?.[1]);

    expect(status).toBe(200);
    expect(response).toContain('"input_tokens"');
  });
});
