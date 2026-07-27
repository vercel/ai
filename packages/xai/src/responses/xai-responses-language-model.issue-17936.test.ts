import type { LanguageModelV4Prompt } from '@ai-sdk/provider';
import {
  convertReadableStreamToArray,
  mockId,
} from '@ai-sdk/provider-utils/test';
import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import fs from 'node:fs';
import { expect, it } from 'vitest';
import { XaiResponsesLanguageModel } from './xai-responses-language-model';

const TEST_PROMPT: LanguageModelV4Prompt = [
  { role: 'user', content: [{ type: 'text', text: 'hello' }] },
];

const EXPECTED_WARNINGS = [
  { type: 'unsupported', feature: 'topK' },
  { type: 'unsupported', feature: 'presencePenalty' },
  { type: 'unsupported', feature: 'frequencyPenalty' },
];

const server = createTestServer({
  'https://api.x.ai/v1/responses': {},
});

function createModel() {
  return new XaiResponsesLanguageModel('grok-4', {
    provider: 'xai.responses',
    baseURL: 'https://api.x.ai/v1',
    headers: () => ({ Authorization: 'Bearer test-key' }),
    generateId: mockId(),
  });
}

it('reproduces issue #17936 for generate and stream warnings', async () => {
  server.urls['https://api.x.ai/v1/responses'].response = {
    type: 'json-value',
    body: JSON.parse(
      fs.readFileSync(
        'src/responses/__fixtures__/xai-web-search-tool.1.json',
        'utf8',
      ),
    ),
  };

  const generateResult = await createModel().doGenerate({
    prompt: TEST_PROMPT,
    topK: 10,
    presencePenalty: 0.5,
    frequencyPenalty: 0.5,
  });

  server.urls['https://api.x.ai/v1/responses'].response = {
    type: 'stream-chunks',
    chunks: fs
      .readFileSync(
        'src/responses/__fixtures__/xai-text-streaming.1.chunks.txt',
        'utf8',
      )
      .split('\n')
      .map(line => `data: ${line}\n\n`)
      .concat('data: [DONE]\n\n'),
  };

  const streamResult = await createModel().doStream({
    prompt: TEST_PROMPT,
    topK: 10,
    presencePenalty: 0.5,
    frequencyPenalty: 0.5,
  });
  const streamParts = await convertReadableStreamToArray(streamResult.stream);
  const streamStart = streamParts.find(part => part.type === 'stream-start');

  expect({
    generate: generateResult.warnings,
    stream: streamStart?.warnings,
  }).toEqual({
    generate: expect.arrayContaining(EXPECTED_WARNINGS),
    stream: expect.arrayContaining(EXPECTED_WARNINGS),
  });
});
