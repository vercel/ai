import fs from 'node:fs';
import type { LanguageModelV4Prompt } from '@ai-sdk/provider';
import { convertReadableStreamToArray } from '@ai-sdk/provider-utils/test';
import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import { describe, expect, it } from 'vitest';
import { createOpenAICompatible } from '../openai-compatible-provider';

const url = 'https://api.mistral.ai/v1/chat/completions';
const server = createTestServer({ [url]: {} });
const model = createOpenAICompatible({
  baseURL: 'https://api.mistral.ai/v1',
  name: 'mistral',
})('mistral-small-latest');

const prompt: LanguageModelV4Prompt = [
  {
    role: 'user',
    content: [{ type: 'text', text: 'What is 17 * 23?' }],
  },
];

const unknownContentPart = {
  type: 'future-part',
  text: { nested: true },
  thinking: { nested: true },
};

function readGenerateFixture() {
  return JSON.parse(
    fs.readFileSync(
      'src/chat/__fixtures__/issue-13703-mistral-thinking.json',
      'utf8',
    ),
  );
}

describe('issue #13703: content arrays with thinking parts', () => {
  it('normalizes non-stream thinking and text parts', async () => {
    server.urls[url].response = {
      type: 'json-value',
      body: readGenerateFixture(),
    };

    const result = await model.doGenerate({ prompt });

    expect(result.content).toEqual([
      {
        type: 'reasoning',
        text: expect.stringContaining('17 multiplied by 23'),
      },
      {
        type: 'text',
        text: expect.stringContaining('391'),
      },
    ]);
  });

  it('ignores unknown non-stream parts with arbitrary fields', async () => {
    const body = readGenerateFixture();
    body.choices[0].message.content = [
      unknownContentPart,
      { type: 'text', text: '391' },
    ];

    server.urls[url].response = {
      type: 'json-value',
      body,
    };

    const result = await model.doGenerate({ prompt });

    expect(result.content).toEqual([{ type: 'text', text: '391' }]);
  });

  it('normalizes streamed thinking and text parts without error events', async () => {
    const chunks = fs
      .readFileSync(
        'src/chat/__fixtures__/issue-13703-mistral-thinking.chunks.txt',
        'utf8',
      )
      .trim()
      .split('\n')
      .map(line => `data: ${line}\n\n`);
    chunks.push('data: [DONE]\n\n');

    server.urls[url].response = {
      type: 'stream-chunks',
      chunks,
    };

    const { stream } = await model.doStream({ prompt });
    const events = await convertReadableStreamToArray(stream);

    expect(events.filter(event => event.type === 'error')).toEqual([]);
    expect(
      events
        .filter(event => event.type === 'reasoning-delta')
        .map(event => event.delta),
    ).toEqual(["Okay, let's", '.']);
    expect(
      events
        .filter(event => event.type === 'text-delta')
        .map(event => event.delta),
    ).toEqual(['**', '}\n\\]']);
  });

  it('ignores unknown streamed parts with arbitrary fields', async () => {
    server.urls[url].response = {
      type: 'stream-chunks',
      chunks: [
        `data: ${JSON.stringify({
          choices: [
            {
              index: 0,
              delta: {
                content: [unknownContentPart, { type: 'text', text: '391' }],
              },
              finish_reason: null,
            },
          ],
        })}\n\n`,
        'data: [DONE]\n\n',
      ],
    };

    const { stream } = await model.doStream({ prompt });
    const events = await convertReadableStreamToArray(stream);

    expect(events.filter(event => event.type === 'error')).toEqual([]);
    expect(
      events
        .filter(event => event.type === 'text-delta')
        .map(event => event.delta),
    ).toEqual(['391']);
  });
});
