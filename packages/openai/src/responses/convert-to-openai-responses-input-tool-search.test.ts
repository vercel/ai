import type { ToolNameMapping } from '@ai-sdk/provider-utils';
import { expect, it } from 'vitest';
import { convertToOpenAIResponsesInput } from './convert-to-openai-responses-input';

const testToolNameMapping: ToolNameMapping = {
  toProviderToolName: (customToolName: string) => customToolName,
  toCustomToolName: (providerToolName: string) => providerToolName,
};

it('preserves distinct hosted tool search item references from provider metadata', async () => {
  const result = await convertToOpenAIResponsesInput({
    toolNameMapping: testToolNameMapping,
    prompt: [
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
            ...({
              providerMetadata: {
                openai: {
                  itemId: 'tsc_hosted_123',
                },
              },
            } as object),
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
            ...({
              providerMetadata: {
                openai: {
                  itemId: 'tso_hosted_456',
                },
              },
            } as object),
          },
        ],
      },
    ],
    systemMessageMode: 'system',
    providerOptionsName: 'openai',
    store: true,
  });

  expect(result.input).toEqual([
    { type: 'item_reference', id: 'tsc_hosted_123' },
    { type: 'item_reference', id: 'tso_hosted_456' },
  ]);
});
