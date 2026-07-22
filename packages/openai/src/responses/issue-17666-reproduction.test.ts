import type { LanguageModelV3Prompt } from '@ai-sdk/provider';
import fs from 'node:fs';
import { expect, it } from 'vitest';
import { createOpenAI } from '../openai-provider';

const toolSearchCallItemId =
  'tsc_07dac4bac56245e1006a606d9ef06481a1afbe9ba9f5b6cff2';
const toolSearchOutputItemId =
  'tso_07dac4bac56245e1006a606d9f135481a1b94ca1a6e53b19df';

const prompt = [
  {
    role: 'assistant',
    content: [
      {
        type: 'tool-call',
        toolCallId: toolSearchCallItemId,
        toolName: 'tool_search',
        input: {
          arguments: { paths: ['get_weather'] },
          call_id: null,
        },
        providerExecuted: true,
        providerMetadata: {
          openai: { itemId: toolSearchCallItemId },
        },
      },
      {
        type: 'tool-result',
        toolCallId: toolSearchCallItemId,
        toolName: 'tool_search',
        output: {
          type: 'json',
          value: {
            tools: [{ name: 'get_weather', type: 'function' }],
          },
        },
        providerMetadata: {
          openai: { itemId: toolSearchOutputItemId },
        },
      },
    ],
  },
] as unknown as LanguageModelV3Prompt;

const liveDuplicateItemError = fs.readFileSync(
  new URL(
    './__fixtures__/openai-tool-search-duplicate-item-error.1.json',
    import.meta.url,
  ),
  'utf8',
);

const successfulResponse = JSON.stringify({
  id: 'resp_issue_17666_fixed',
  created_at: 1784704415,
  model: 'gpt-5.4-2026-03-05',
  output: [],
  usage: {
    input_tokens: 0,
    output_tokens: 0,
  },
});

it('preserves the tool_search output item id after a providerMetadata round trip', async () => {
  let itemReferenceIds: string[] = [];

  const model = createOpenAI({
    apiKey: 'test-api-key',
    fetch: async (_input, init) => {
      if (typeof init?.body !== 'string') {
        throw new Error('Expected a JSON request body.');
      }

      const requestBody = JSON.parse(init.body) as {
        input: Array<{ type?: string; id?: string }>;
      };

      itemReferenceIds = requestBody.input
        .filter(
          (item): item is { type: 'item_reference'; id: string } =>
            item.type === 'item_reference' && typeof item.id === 'string',
        )
        .map(item => item.id);

      const hasDuplicateItemReference =
        new Set(itemReferenceIds).size !== itemReferenceIds.length;

      return new Response(
        hasDuplicateItemReference ? liveDuplicateItemError : successfulResponse,
        {
          status: hasDuplicateItemReference ? 400 : 200,
          headers: { 'content-type': 'application/json' },
        },
      );
    },
  })('gpt-5.4');

  await model.doGenerate({
    prompt,
    providerOptions: { openai: { store: true } },
  });

  expect(itemReferenceIds).toEqual([
    toolSearchCallItemId,
    toolSearchOutputItemId,
  ]);
});
