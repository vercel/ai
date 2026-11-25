import { dynamicTool, tool } from '@ai-sdk/provider-utils';
import { describe, expect, test } from 'vitest';
import { z } from 'zod/v4';
import { HarnessEffectError } from '../../../errors/harness-effect-error';
import {
  translateFinishReason,
  translateStreamPart,
} from './translate-stream-part';
import type { HarnessAgentStreamPart } from './create-stream-writer';

const tools = {
  weather: tool({ inputSchema: z.object({ city: z.string() }) }),
  dynamicWeather: dynamicTool({
    inputSchema: z.object({ city: z.string() }),
  }),
};

function translate(options: { part: HarnessAgentStreamPart }) {
  return translateStreamPart({ part: options.part, tools });
}

describe('translateFinishReason', () => {
  test('translates cancelled to other with the raw reason cancelled', () => {
    expect(
      translateFinishReason({
        finishReason: { unified: 'cancelled', raw: 'aborted' },
      }),
    ).toEqual({ finishReason: 'other', rawFinishReason: 'cancelled' });
  });

  test('passes other reasons through', () => {
    expect(
      translateFinishReason({
        finishReason: { unified: 'stop', raw: 'end_turn' },
      }),
    ).toEqual({ finishReason: 'stop', rawFinishReason: 'end_turn' });
  });
});

describe('translateStreamPart', () => {
  test.each([
    { toolName: 'weather', dynamic: undefined },
    { toolName: 'dynamicWeather', dynamic: true },
    { toolName: 'mcp__context7__query_docs', dynamic: true },
  ])(
    'keeps $toolName dynamic classification consistent from input start to call',
    async ({ toolName, dynamic }) => {
      const start = await translate({
        part: { type: 'tool-input-start', id: 'call-1', toolName },
      });
      const call = await translate({
        part: {
          type: 'tool-call',
          toolCallId: 'call-1',
          toolName,
          input: '{"city":"Berlin"}',
        },
      });

      expect([start, call].map(parts => parts[0])).toEqual([
        {
          type: 'tool-input-start',
          id: 'call-1',
          toolName,
          dynamic,
        },
        {
          type: 'tool-call',
          toolCallId: 'call-1',
          toolName,
          input: { city: 'Berlin' },
          dynamic,
        },
      ]);
    },
  );

  const toolCall = {
    type: 'tool-call' as const,
    toolCallId: 'call-1',
    toolName: 'weather',
    input: { city: 'Berlin' },
  };

  test.each<HarnessAgentStreamPart>([
    {
      type: 'tool-approval-request',
      approvalId: 'approval-1',
      toolCall,
      reason: 'Check first',
    },
    {
      type: 'tool-approval-response',
      approvalId: 'approval-1',
      toolCall: { ...toolCall, providerMetadata: { test: { key: 'value' } } },
      approved: true,
      reason: 'Trusted',
      providerExecuted: false,
    },
    { type: 'tool-output-denied', toolCallId: 'call-1', toolName: 'weather' },
    {
      type: 'tool-result',
      toolCallId: 'call-1',
      toolName: 'weather',
      input: { city: 'Berlin' },
      output: { temperature: 20 },
      preliminary: true,
    },
    {
      type: 'tool-error',
      toolCallId: 'call-2',
      toolName: 'Bash',
      input: { command: 'ls' },
      error: 'failed',
      dynamic: true,
      providerExecuted: true,
    },
  ])('passes $type parts through unchanged', async part => {
    const result = await translate({ part });
    expect(result).toEqual([part]);
    expect(result[0]).toBe(part);
  });

  test('translates text parts and leaves out turn boundaries', async () => {
    expect(await translate({ part: { type: 'start-turn' } })).toEqual([]);
    expect(await translate({ part: { type: 'settle' } })).toEqual([]);
    expect(
      await translate({
        part: {
          type: 'text-delta',
          id: 'text',
          delta: 'hi',
          harnessMetadata: { test: { value: 1 } },
        },
      }),
    ).toEqual([
      {
        type: 'text-delta',
        id: 'text',
        text: 'hi',
        providerMetadata: { test: { value: 1 } },
      },
    ]);
  });

  test('translates a typed tool call with its parsed input', async () => {
    expect(
      await translate({
        part: {
          type: 'tool-call',
          toolCallId: 'call-1',
          toolName: 'weather',
          input: '{"city":"Berlin"}',
        },
      }),
    ).toEqual([
      {
        type: 'tool-call',
        toolCallId: 'call-1',
        toolName: 'weather',
        input: { city: 'Berlin' },
      },
    ]);
  });

  test('marks calls of unknown tools as dynamic and invalid input as invalid', async () => {
    expect(
      await translate({
        part: {
          type: 'tool-call',
          toolCallId: 'call-1',
          toolName: 'Bash',
          input: '',
          providerExecuted: true,
        },
      }),
    ).toEqual([
      {
        type: 'tool-call',
        toolCallId: 'call-1',
        toolName: 'Bash',
        input: {},
        dynamic: true,
        providerExecuted: true,
      },
    ]);
    expect(
      await translate({
        part: {
          type: 'tool-call',
          toolCallId: 'call-2',
          toolName: 'weather',
          input: '{',
        },
      }),
    ).toEqual([
      expect.objectContaining({
        type: 'tool-call',
        input: '{',
        dynamic: true,
        invalid: true,
      }),
    ]);
  });

  test('represents a file change as a synthetic provider-executed tool call', async () => {
    const parts = await translate({
      part: { type: 'file-change', event: 'modify', path: 'a.ts' },
    });

    expect(parts).toEqual([
      {
        type: 'tool-call',
        toolCallId: expect.stringMatching(/^harness-file-change-/),
        toolName: 'fileChange',
        input: { event: 'modify', path: 'a.ts' },
        dynamic: true,
        providerExecuted: true,
      },
      {
        type: 'tool-result',
        toolCallId: expect.stringMatching(/^harness-file-change-/),
        toolName: 'fileChange',
        input: { event: 'modify', path: 'a.ts' },
        output: { event: 'modify', path: 'a.ts' },
        dynamic: true,
        providerExecuted: true,
      },
    ]);
  });

  test('wraps error parts in a HarnessEffectError', async () => {
    const [part] = await translate({
      part: { type: 'error', error: { message: 'failed' } },
    });

    expect(part.type).toBe('error');
    expect(
      part.type === 'error' && HarnessEffectError.isInstance(part.error),
    ).toBe(true);
  });

  test('returns nothing for parts the stream result handles itself', async () => {
    expect(
      await translate({
        part: {
          type: 'finish-step',
          finishReason: { unified: 'stop', raw: 'stop' },
          usage: {
            inputTokens: {
              total: 1,
              noCache: 1,
              cacheRead: undefined,
              cacheWrite: undefined,
            },
            outputTokens: { total: 1, text: 1, reasoning: undefined },
          },
        },
      }),
    ).toEqual([]);
    expect(await translate({ part: { type: 'reset-step' } })).toEqual([]);
  });
});
