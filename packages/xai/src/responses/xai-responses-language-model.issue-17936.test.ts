import type { LanguageModelV2Prompt } from '@ai-sdk/provider';
import {
  convertReadableStreamToArray,
  mockId,
} from '@ai-sdk/provider-utils/test';
import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { XaiResponsesLanguageModel } from './xai-responses-language-model';

const TEST_PROMPT: LanguageModelV2Prompt = [
  { role: 'user', content: [{ type: 'text', text: 'hello' }] },
];

const EXPECTED_WARNINGS = [
  { type: 'unsupported-setting', setting: 'topK' },
  { type: 'unsupported-setting', setting: 'presencePenalty' },
  { type: 'unsupported-setting', setting: 'frequencyPenalty' },
];

function createModel() {
  return new XaiResponsesLanguageModel('grok-4', {
    provider: 'xai.responses',
    baseURL: 'https://api.x.ai/v1',
    headers: () => ({ Authorization: 'Bearer test-key' }),
    generateId: mockId(),
  });
}

describe('issue #17936 unsupported call settings', () => {
  const server = createTestServer({
    'https://api.x.ai/v1/responses': {},
  });

  it('returns warnings from doGenerate', async () => {
    server.urls['https://api.x.ai/v1/responses'].response = {
      type: 'json-value',
      body: JSON.parse(
        fs.readFileSync(
          'src/responses/__fixtures__/issue-17936-generate.json',
          'utf8',
        ),
      ),
    };

    const result = await createModel().doGenerate({
      prompt: TEST_PROMPT,
      topK: 10,
      presencePenalty: 0.5,
      frequencyPenalty: 0.5,
    });

    expect(result.warnings).toEqual(expect.arrayContaining(EXPECTED_WARNINGS));
  });

  it('returns warnings from doStream', async () => {
    const chunks = fs
      .readFileSync(
        'src/responses/__fixtures__/issue-17936-stream.chunks.txt',
        'utf8',
      )
      .trim()
      .split('\n')
      .map(line => `data: ${line}\n\n`);
    chunks.push('data: [DONE]\n\n');
    server.urls['https://api.x.ai/v1/responses'].response = {
      type: 'stream-chunks',
      chunks,
    };

    const { stream } = await createModel().doStream({
      prompt: TEST_PROMPT,
      topK: 10,
      presencePenalty: 0.5,
      frequencyPenalty: 0.5,
    });
    const parts = await convertReadableStreamToArray(stream);
    const streamStart = parts.find(part => part.type === 'stream-start');

    expect(streamStart).toEqual({
      type: 'stream-start',
      warnings: expect.arrayContaining(EXPECTED_WARNINGS),
    });
  });
});
