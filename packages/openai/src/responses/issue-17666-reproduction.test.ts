import type { LanguageModelV4Prompt } from '@ai-sdk/provider';
import fs from 'node:fs';
import { expect, it } from 'vitest';
import { createOpenAI } from '../openai-provider';

it('preserves the tool_search output item id after a provider metadata round trip', async () => {
  const errorFixture = fs.readFileSync(
    'src/responses/__fixtures__/openai-tool-search-duplicate-item-error.1.json',
    'utf8',
  );
  let capturedBody: unknown;

  const model = createOpenAI({
    apiKey: 'test-api-key',
    fetch: async (_url, init) => {
      capturedBody =
        typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
      return new Response(errorFixture, {
        status: 400,
        headers: { 'content-type': 'application/json' },
      });
    },
  });

  const prompt = [
    {
      role: 'assistant',
      content: [
        {
          type: 'tool-call',
          toolCallId: 'tsc_hosted_123',
          toolName: 'tool_search',
          input: {
            arguments: { paths: ['get_weather'] },
            call_id: null,
          },
          providerExecuted: true,
          providerMetadata: {
            openai: { itemId: 'tsc_hosted_123' },
          },
        },
        {
          type: 'tool-result',
          toolCallId: 'tsc_hosted_123',
          toolName: 'tool_search',
          output: {
            type: 'json',
            value: {
              tools: [{ name: 'get_weather', type: 'function' }],
            },
          },
          providerMetadata: {
            openai: { itemId: 'tso_hosted_456' },
          },
        },
      ],
    },
  ] as unknown as LanguageModelV4Prompt;

  try {
    await model('gpt-5.6').doGenerate({
      prompt,
      providerOptions: {
        openai: { store: true },
      },
    });
  } catch {
    // The recorded live response is the duplicate-item rejection.
  }

  expect(capturedBody).toMatchObject({
    input: [
      { type: 'item_reference', id: 'tsc_hosted_123' },
      { type: 'item_reference', id: 'tso_hosted_456' },
    ],
  });
});
