import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

type StreamEvent =
  | {
      type: 'message_start';
      message: {
        usage: {
          input_tokens: number;
          output_tokens: number;
        };
      };
    }
  | {
      type: 'message_delta';
      usage: {
        input_tokens: number;
        output_tokens: number;
      };
    };

function readStreamFixture(filename: string): StreamEvent[] {
  return readFileSync(`src/__fixtures__/${filename}.chunks.txt`, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map(line => JSON.parse(line) as StreamEvent);
}

function getUsage(filename: string) {
  const events = readStreamFixture(filename);
  const messageStart = events.find(
    event => event.type === 'message_start',
  ) as Extract<StreamEvent, { type: 'message_start' }>;
  const messageDelta = events.find(
    event => event.type === 'message_delta',
  ) as Extract<StreamEvent, { type: 'message_delta' }>;

  return {
    messageStart: messageStart.message.usage,
    messageDelta: messageDelta.usage,
  };
}

describe('issue #17326 Anthropic compatibility', () => {
  it('reports Anthropic input usage in message_start', () => {
    const usage = getUsage('issue-17326-anthropic-stream');

    expect(usage.messageStart.input_tokens).toBe(
      usage.messageDelta.input_tokens,
    );
  });

  it('provides useful message_start input usage for a non-Anthropic model', () => {
    const usage = getUsage('issue-17326-xai-stream');

    expect(usage.messageStart.input_tokens).toBe(
      usage.messageDelta.input_tokens,
    );
  });

  it('counts tokens for a non-Anthropic gateway model', () => {
    const response = JSON.parse(
      readFileSync(
        'src/__fixtures__/issue-17326-xai-count-tokens.json',
        'utf8',
      ),
    ) as unknown;

    expect(response).toEqual({
      input_tokens: expect.any(Number),
    });
  });
});
