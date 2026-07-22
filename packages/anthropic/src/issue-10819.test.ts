import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import { convertReadableStreamToArray } from '@ai-sdk/provider-utils/test';
import fs from 'node:fs';
import { expect, it, vi } from 'vitest';
import { createAnthropic } from './anthropic-provider';

vi.mock('./version', () => ({
  VERSION: '0.0.0-test',
}));

const server = createTestServer({
  'https://api.anthropic.com/v1/messages': {},
});

it('parses the live provider-executed web fetch error before the client tool call', async () => {
  const chunks = fs
    .readFileSync(
      'src/__fixtures__/anthropic-issue-10819-web-fetch-error.1.chunks.txt',
      'utf8',
    )
    .trim()
    .split('\n')
    .map(line => `data: ${line}\n\n`);
  chunks.push('data: [DONE]\n\n');

  server.urls['https://api.anthropic.com/v1/messages'].response = {
    type: 'stream-chunks',
    chunks,
  };

  const provider = createAnthropic({ apiKey: 'test-api-key' });
  const result = await provider('claude-sonnet-4-5-20250929').doStream({
    prompt: [
      {
        role: 'user',
        content: [{ type: 'text', text: 'Run both tools.' }],
      },
    ],
    tools: [
      {
        type: 'provider-defined',
        id: 'anthropic.web_fetch_20250910',
        name: 'web_fetch',
        args: { maxUses: 1 },
      },
      {
        type: 'function',
        name: 'display_products',
        description: 'Record that product display was attempted.',
        inputSchema: {
          type: 'object',
          properties: {},
          additionalProperties: false,
        },
      },
    ],
  });

  expect(await convertReadableStreamToArray(result.stream)).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        type: 'tool-call',
        toolName: 'web_fetch',
        providerExecuted: true,
      }),
      expect.objectContaining({
        type: 'tool-result',
        toolName: 'web_fetch',
        result: {
          type: 'web_fetch_tool_result_error',
          errorCode: expect.any(String),
        },
        isError: true,
        providerExecuted: true,
      }),
      expect.objectContaining({
        type: 'tool-call',
        toolName: 'display_products',
      }),
    ]),
  );
});
