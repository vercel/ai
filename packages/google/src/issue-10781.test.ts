import type { LanguageModelV2Prompt } from '@ai-sdk/provider';
import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import { convertReadableStreamToArray } from '@ai-sdk/provider-utils/test';
import fs from 'node:fs';
import { expect, it, vi } from 'vitest';
import { createGoogleGenerativeAI } from './google-provider';

vi.mock('./version', () => ({
  VERSION: '0.0.0-test',
}));

const prompt: LanguageModelV2Prompt = [
  { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
];

const url =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-pro-preview:streamGenerateContent';
const server = createTestServer({ [url]: {} });
const model = createGoogleGenerativeAI({ apiKey: 'test-api-key' })(
  'gemini-3.1-pro-preview',
);

function readFixture(step: number) {
  return fs
    .readFileSync(`src/__fixtures__/issue-10781.${step}.chunks.txt`, 'utf8')
    .trim()
    .split('\n')
    .map(line => `data: ${line}\n\n`);
}

it('resets the recorded Google text block counter to ID 0 per call', async () => {
  server.urls[url].response = [1, 2].map(step => ({
    type: 'stream-chunks' as const,
    chunks: readFixture(step),
  }));

  const callTextParts = [];

  for (let call = 0; call < 2; call++) {
    const { stream } = await model.doStream({
      prompt,
      includeRawChunks: false,
    });
    const events = await convertReadableStreamToArray(stream);

    callTextParts.push(
      events
        .filter(
          event => event.type === 'text-start' || event.type === 'text-end',
        )
        .map(event => ({ type: event.type, id: event.id })),
    );
  }

  expect(callTextParts).toStrictEqual([
    [
      { type: 'text-start', id: '0' },
      { type: 'text-end', id: '0' },
    ],
    [
      { type: 'text-start', id: '0' },
      { type: 'text-end', id: '0' },
    ],
  ]);
});
