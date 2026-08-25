import fs from 'node:fs';
import type { LanguageModelV3StreamPart } from '@ai-sdk/provider';
import { describe, expect, it } from 'vitest';
import { createOpenAI } from '../openai-provider';

const fixture = fs.readFileSync(
  'src/responses/__fixtures__/issue-19493-gpt-5.1-tool-call.chunks.txt',
  'utf8',
);

function createStream({ omitOutputIndex }: { omitOutputIndex: boolean }) {
  return fixture
    .split('\n')
    .filter(line => line.length > 0)
    .map(line => {
      const chunk = JSON.parse(line);
      if (omitOutputIndex && 'output_index' in chunk) {
        delete chunk.output_index;
      }
      return `data: ${JSON.stringify(chunk)}\n\n`;
    })
    .join('');
}

async function readStream(omitOutputIndex: boolean) {
  const provider = createOpenAI({
    apiKey: 'test-api-key',
    fetch: async () =>
      new Response(createStream({ omitOutputIndex }), {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      }),
  });

  const { stream } = await provider.responses('gpt-5.1').doStream({
    prompt: [
      {
        role: 'user',
        content: [{ type: 'text', text: 'Call get_weather for Beijing.' }],
      },
    ],
  });

  const parts: LanguageModelV3StreamPart[] = [];
  const reader = stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      return parts;
    }
    parts.push(value);
  }
}

describe('issue #19493', () => {
  it('signals malformed known events and does not finish as stop', async () => {
    const valid = await readStream(false);
    expect(valid.some(part => part.type === 'tool-call')).toBe(true);
    expect(valid.at(-1)).toMatchObject({
      type: 'finish',
      finishReason: { unified: 'tool-calls' },
    });

    const malformed = await readStream(true);
    const streamStart = malformed.find(part => part.type === 'stream-start');
    const finish = [...malformed]
      .reverse()
      .find(part => part.type === 'finish');

    const validationWasSignaled =
      malformed.some(part => part.type === 'error') ||
      (streamStart?.type === 'stream-start' && streamStart.warnings.length > 0);
    const didNotFinishAsStop =
      finish?.type === 'finish' && finish.finishReason.unified !== 'stop';

    expect({ validationWasSignaled, didNotFinishAsStop }).toEqual({
      validationWasSignaled: true,
      didNotFinishAsStop: true,
    });
  });
});
