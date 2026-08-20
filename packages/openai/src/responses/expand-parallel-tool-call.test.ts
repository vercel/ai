import type { LanguageModelV4FunctionTool } from '@ai-sdk/provider';
import { describe, expect, it } from 'vitest';
import { expandParallelToolCall } from './expand-parallel-tool-call';

const tools: Array<LanguageModelV4FunctionTool> = [
  {
    type: 'function',
    name: 'weather',
    inputSchema: { type: 'object' },
  },
  {
    type: 'function',
    name: 'cityAttractions',
    inputSchema: { type: 'object' },
  },
];

const providerContext = {
  providerOptionsName: 'openai',
  itemId: 'fc_parallel',
};

describe('expandParallelToolCall', () => {
  it('expands an internal parallel wrapper into declared tool calls', async () => {
    await expect(
      expandParallelToolCall({
        ...providerContext,
        toolCall: {
          toolCallId: 'call_parallel',
          toolName: 'parallel',
          input: JSON.stringify({
            tool_uses: [
              {
                recipient_name: 'functions.weather',
                parameters: { location: 'San Francisco' },
              },
              {
                recipient_name: 'functions.cityAttractions',
                parameters: { city: 'Rome' },
              },
            ],
          }),
        },
        tools,
      }),
    ).resolves.toEqual([
      {
        type: 'tool-call',
        toolCallId: 'call_parallel_0',
        toolName: 'weather',
        input: '{"location":"San Francisco"}',
        providerMetadata: {
          openai: {
            parallelToolCall: {
              itemId: 'fc_parallel',
              toolCallId: 'call_parallel',
              toolName: 'parallel',
              input:
                '{"tool_uses":[{"recipient_name":"functions.weather","parameters":{"location":"San Francisco"}},{"recipient_name":"functions.cityAttractions","parameters":{"city":"Rome"}}]}',
              index: 0,
              count: 2,
            },
          },
        },
      },
      {
        type: 'tool-call',
        toolCallId: 'call_parallel_1',
        toolName: 'cityAttractions',
        input: '{"city":"Rome"}',
        providerMetadata: {
          openai: {
            parallelToolCall: {
              itemId: 'fc_parallel',
              toolCallId: 'call_parallel',
              toolName: 'parallel',
              input:
                '{"tool_uses":[{"recipient_name":"functions.weather","parameters":{"location":"San Francisco"}},{"recipient_name":"functions.cityAttractions","parameters":{"city":"Rome"}}]}',
              index: 1,
              count: 2,
            },
          },
        },
      },
    ]);
  });

  it('does not expand a declared tool named parallel', async () => {
    await expect(
      expandParallelToolCall({
        ...providerContext,
        toolCall: {
          toolCallId: 'call_parallel',
          toolName: 'parallel',
          input:
            '{"tool_uses":[{"recipient_name":"functions.weather","parameters":{"location":"Rome"}}]}',
        },
        tools: [
          ...tools,
          {
            type: 'function',
            name: 'parallel',
            inputSchema: { type: 'object' },
          },
        ],
      }),
    ).resolves.toBeUndefined();
  });

  it.each([
    ['invalid JSON', 'not JSON'],
    ['an empty wrapper', '{"tool_uses":[]}'],
    [
      'an unavailable nested tool',
      '{"tool_uses":[{"recipient_name":"functions.unknown","parameters":{}}]}',
    ],
    [
      'a recipient without the functions prefix',
      '{"tool_uses":[{"recipient_name":"weather","parameters":{}}]}',
    ],
    [
      'non-object parameters',
      '{"tool_uses":[{"recipient_name":"functions.weather","parameters":null}]}',
    ],
  ])('does not expand %s', async (_name, input) => {
    await expect(
      expandParallelToolCall({
        ...providerContext,
        toolCall: {
          toolCallId: 'call_parallel',
          toolName: 'parallel',
          input,
        },
        tools,
      }),
    ).resolves.toBeUndefined();
  });
});
