import { convertReadableStreamToArray } from '@ai-sdk/provider-utils/test';
import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import fs from 'node:fs';
import { expect, it, vi } from 'vitest';
import { createOpenAI } from './openai-provider';
import type { OpenaiResponsesTextProviderMetadata } from './responses/openai-responses-provider-metadata';

vi.mock('./version', () => ({
  VERSION: '0.0.0-test',
}));

const responsesUrl = 'https://api.openai.com/v1/responses';
const batchUrl = 'https://api.openai.com/v1/batches/batch_1';
const outputUrl = 'https://api.openai.com/v1/files/file_1/content';

const server = createTestServer({
  [responsesUrl]: {},
  [batchUrl]: {},
  [outputUrl]: {},
});

it('preserves Responses citation annotations in batch text results', async () => {
  const responseBody = JSON.parse(
    fs.readFileSync(
      'src/responses/__fixtures__/openai-web-search-tool.1.json',
      'utf8',
    ),
  );
  server.urls[responsesUrl].response = {
    type: 'json-value',
    body: responseBody,
  };
  server.urls[batchUrl].response = {
    type: 'json-value',
    body: {
      id: 'batch_1',
      status: 'completed',
      output_file_id: 'file_1',
      error_file_id: null,
    },
  };
  server.urls[outputUrl].response = {
    type: 'stream-chunks',
    chunks: [
      `${JSON.stringify({
        custom_id: 'request_1',
        response: { status_code: 200, body: responseBody },
        error: null,
      })}\n`,
    ],
  };

  const provider = createOpenAI({ apiKey: 'test-api-key' });
  const direct = await provider(responseBody.model).doGenerate({
    prompt: [
      {
        role: 'user',
        content: [{ type: 'text', text: 'What happened in tech news today?' }],
      },
    ],
  });
  const batchStream = await provider
    .experimental_batch()
    .doGetBatchResults({ batchId: 'batch_1' });
  const [batch] = await convertReadableStreamToArray(batchStream);
  const directText = direct.content.find(part => part.type === 'text');
  const batchText =
    batch.type === 'text' && batch.status === 'succeeded'
      ? batch.result.content.find(part => part.type === 'text')
      : undefined;
  const directOpenAIMetadata = directText?.providerMetadata as
    | OpenaiResponsesTextProviderMetadata
    | undefined;

  expect(directText?.type).toBe('text');
  expect(batchText?.type).toBe('text');
  expect(directOpenAIMetadata?.openai.annotations?.length).toBeGreaterThan(0);
  expect(directText?.citations?.length).toBeGreaterThan(0);
  expect(batchText?.providerMetadata?.openai?.annotations).toEqual(
    directOpenAIMetadata?.openai.annotations,
  );
  expect(batchText?.citations).toEqual(directText?.citations);
});
