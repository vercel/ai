import type { LanguageModelV4StreamPart } from '@ai-sdk/provider';
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createOpenAI } from '../openai-provider';

const fixturePath =
  'src/responses/__fixtures__/issue-19493-gpt-5.1-tool-call.chunks.txt';

function createSse({ omitOutputIndex }: { omitOutputIndex: boolean }) {
  return fs
    .readFileSync(fixturePath, 'utf8')
    .trim()
    .split('\n')
    .map(line => {
      const event = JSON.parse(line);
      if (omitOutputIndex) {
        delete event.output_index;
      }
      return `data: ${JSON.stringify(event)}\n\n`;
    })
    .join('');
}

async function collectParts(omitOutputIndex: boolean) {
  const provider = createOpenAI({
    apiKey: 'test-api-key',
    fetch: async () =>
      new Response(createSse({ omitOutputIndex }), {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      }),
  });

  const { stream } = await provider.responses('gpt-5.1').doStream({
    prompt: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }],
  });

  const parts: LanguageModelV4StreamPart[] = [];
  const reader = stream.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    parts.push(value);
  }
  return parts;
}

describe('issue #19493', () => {
  it('does not silently downgrade schema-rejected tool-call events to stop', async () => {
    const controlParts = await collectParts(false);
    const rejectedParts = await collectParts(true);

    expect(controlParts.some(part => part.type === 'tool-call')).toBe(true);
    expect(
      [...controlParts].reverse().find(part => part.type === 'finish')
        ?.finishReason.unified,
    ).toBe('tool-calls');

    const streamStart = rejectedParts.find(
      part => part.type === 'stream-start',
    );
    const hasWarning =
      streamStart?.type === 'stream-start' && streamStart.warnings.length > 0;
    const hasError = rejectedParts.some(part => part.type === 'error');

    expect(hasWarning || hasError).toBe(true);
    expect(
      [...rejectedParts].reverse().find(part => part.type === 'finish')
        ?.finishReason.unified,
    ).not.toBe('stop');
  });
});
