import type {
  LanguageModelV3Prompt,
  LanguageModelV3StreamPart,
} from '@ai-sdk/provider';
import { convertReadableStreamToArray } from '@ai-sdk/provider-utils/test';
import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import fs from 'node:fs';
import { expect, it, vi } from 'vitest';
import { createGoogleGenerativeAI } from './google-provider';

vi.mock('./version', () => ({
  VERSION: '0.0.0-test',
}));

const TEST_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-pro-preview:streamGenerateContent';
const TEST_PROMPT: LanguageModelV3Prompt = [
  { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
];

const server = createTestServer({
  [TEST_URL]: {},
});

it('resets generated text block IDs for each recorded response', async () => {
  const model = createGoogleGenerativeAI({ apiKey: 'test-api-key' }).chat(
    'gemini-3.1-pro-preview',
  );
  const idsByCall: string[][] = [];

  for (const fixture of ['issue-10781.1', 'issue-10781.2']) {
    const chunks = fs
      .readFileSync(`src/__fixtures__/${fixture}.chunks.txt`, 'utf8')
      .split('\n')
      .filter(line => line.trim().length > 0)
      .map(line => `data: ${line}\n\n`);

    server.urls[TEST_URL].response = {
      type: 'stream-chunks',
      chunks,
    };

    const { stream } = await model.doStream({ prompt: TEST_PROMPT });
    const parts = await convertReadableStreamToArray(stream);
    idsByCall.push(
      parts
        .filter(
          (
            part,
          ): part is Extract<
            LanguageModelV3StreamPart,
            { type: 'text-start' | 'text-end' }
          > => part.type === 'text-start' || part.type === 'text-end',
        )
        .map(part => part.id),
    );
  }

  expect(idsByCall).toEqual([
    ['0', '0'],
    ['0', '0'],
  ]);
});
