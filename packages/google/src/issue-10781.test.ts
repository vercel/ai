import type {
  LanguageModelV4Prompt,
  LanguageModelV4StreamPart,
} from '@ai-sdk/provider';
import { convertReadableStreamToArray } from '@ai-sdk/provider-utils/test';
import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import fs from 'node:fs';
import { expect, it, vi } from 'vitest';
import { createGoogle } from './google-provider';

vi.mock('./version', () => ({
  VERSION: '0.0.0-test',
}));

const TEST_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-pro-preview:streamGenerateContent';
const TEST_PROMPT: LanguageModelV4Prompt = [
  { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
];

const server = createTestServer({
  [TEST_URL]: {},
});

it('uses unique text block IDs across model calls (issue #10781)', async () => {
  const model = createGoogle({ apiKey: 'test-api-key' }).chat(
    'gemini-3.1-pro-preview',
  );
  const boundaries: Array<{ type: 'text-start' | 'text-end'; id: string }> = [];

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
    boundaries.push(
      ...parts.filter(
        (
          part,
        ): part is Extract<
          LanguageModelV4StreamPart,
          { type: 'text-start' | 'text-end' }
        > => part.type === 'text-start' || part.type === 'text-end',
      ),
    );
  }

  const startIds = boundaries
    .filter(boundary => boundary.type === 'text-start')
    .map(boundary => boundary.id);
  const endIds = boundaries
    .filter(boundary => boundary.type === 'text-end')
    .map(boundary => boundary.id);

  expect({
    startCount: startIds.length,
    uniqueStartCount: new Set(startIds).size,
    endCount: endIds.length,
    uniqueEndCount: new Set(endIds).size,
  }).toEqual({
    startCount: 2,
    uniqueStartCount: 2,
    endCount: 2,
    uniqueEndCount: 2,
  });
});
