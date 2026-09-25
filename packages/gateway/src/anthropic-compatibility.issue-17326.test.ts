// @vitest-environment node

import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

type Usage = {
  input_tokens: number;
  output_tokens: number;
};

function readStreamFixture(filename: string): {
  startUsage: Usage;
  finalUsage: Usage;
} {
  const body = fs.readFileSync(`src/__fixtures__/${filename}`, 'utf8');
  const events = body
    .split('\n')
    .filter(line => line.startsWith('data: '))
    .map(line => JSON.parse(line.slice('data: '.length)));

  const messageStart = events.find(event => event.type === 'message_start');
  const messageDelta = events.find(event => event.type === 'message_delta');

  return {
    startUsage: messageStart.message.usage,
    finalUsage: messageDelta.usage,
  };
}

describe('AI Gateway Anthropic compatibility issue #17326', () => {
  it.each([
    'issue-17326-anthropic-claude-haiku-4.5.chunks.txt',
    'issue-17326-xai-grok-4.5.chunks.txt',
  ])('reports usable input tokens in message_start for %s', filename => {
    const { startUsage, finalUsage } = readStreamFixture(filename);

    expect(finalUsage.input_tokens).toBeGreaterThan(0);
    expect(startUsage.input_tokens).toBeGreaterThan(0);
  });

  it('does not proxy a non-Anthropic model to Anthropic count_tokens', () => {
    const fixture = JSON.parse(
      fs.readFileSync(
        'src/__fixtures__/issue-17326-xai-grok-4.5-count-tokens.json',
        'utf8',
      ),
    );

    expect(fixture.status).not.toBe(404);
    expect(fixture.body.error?.type).not.toBe('not_found_error');
  });
});
