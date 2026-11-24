import { dynamicTool, tool } from '@ai-sdk/provider-utils';
import { describe, expect, test } from 'vitest';
import { z } from 'zod/v4';
import { HarnessEffectError } from '../../../errors/harness-effect-error';
import {
  translateFinishReason,
  translateStreamPart,
  type TranslatedToolCall,
} from './translate-stream-part';
import type { HarnessAgentStreamPart } from './create-stream-writer';

const tools = {
  weather: tool({ inputSchema: z.object({ city: z.string() }) }),
  dynamicWeather: dynamicTool({
    inputSchema: z.object({ city: z.string() }),
  }),
};

function translate(options: {
  part: HarnessAgentStreamPart;
  toolCalls?: Map<string, TranslatedToolCall>;
}) {
  return translateStreamPart({
    part: options.part,
    tools,
    toolCalls: options.toolCalls ?? new Map(),
  });
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
    'keeps $toolName dynamic classification consistent from input start to result',
    async ({ toolName, dynamic }) => {
      const toolCalls = new Map<string, TranslatedToolCall>();
      const start = await translate({
        part: { type: 'tool-input-start', id: 'call-1', toolName },
        toolCalls,
      });
      const call = await translate({
        part: {
          type: 'tool-call',
          toolCallId: 'call-1',
          toolName,
          input: '{"city":"Berlin"}',
        },
        toolCalls,
      });
      const result = await translate({
        part: {
          type: 'tool-result',
          toolCallId: 'call-1',
          toolName,
          result: 'sunny',
        },
        toolCalls,
      });

      expect([start, call, result].map(parts => parts[0])).toEqual([
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
        {
          type: 'tool-result',
          toolCallId: 'call-1',
          toolName,
          input: { city: 'Berlin' },
          output: 'sunny',
          dynamic,
        },
      ]);
    },
  );

  test('translates host tool approval parts', async () => {
    const toolCalls = new Map<string, TranslatedToolCall>();
    await translate({
      part: {
        type: 'tool-call',
        toolCallId: 'call-1',
        toolName: 'weather',
        input: '{"city":"Berlin"}',
      },
      toolCalls,
    });
    await translate({
      part: {
        type: 'tool-call',
        toolCallId: 'call-2',
        toolName: 'unknownTool',
        input: '{}',
      },
      toolCalls,
    });
    expect(
      await translate({
        part: {
          type: 'tool-approval-request',
          approvalId: 'approval-1',
          toolCallId: 'call-1',
          reason: 'Check first',
        },
        toolCalls,
      }),
    ).toMatchInlineSnapshot(`
      [
        {
          "approvalId": "approval-1",
          "reason": "Check first",
          "toolCall": {
            "input": {
              "city": "Berlin",
            },
            "toolCallId": "call-1",
            "toolName": "weather",
            "type": "tool-call",
          },
          "type": "tool-approval-request",
        },
      ]
    `);
    expect(
      await translate({
        part: {
          type: 'tool-approval-response',
          approvalId: 'approval-2',
          toolCall: {
            type: 'tool-call',
            toolCallId: 'call-2',
            toolName: 'unknownTool',
            input: {},
            dynamic: true,
          },
          approved: false,
          reason: 'No',
        },
        toolCalls,
      }),
    ).toMatchInlineSnapshot(`
      [
        {
          "approvalId": "approval-2",
          "approved": false,
          "reason": "No",
          "toolCall": {
            "dynamic": true,
            "input": {},
            "toolCallId": "call-2",
            "toolName": "unknownTool",
            "type": "tool-call",
          },
          "type": "tool-approval-response",
        },
      ]
    `);
    expect(
      await translate({
        part: {
          type: 'tool-output-denied',
          toolCallId: 'call-2',
          toolName: 'unknownTool',
        },
      }),
    ).toEqual([
      {
        type: 'tool-output-denied',
        toolCallId: 'call-2',
        toolName: 'unknownTool',
      },
    ]);
  });

  test('rejects approval parts without their recorded tool call', async () => {
    await expect(
      translate({
        part: {
          type: 'tool-approval-request',
          approvalId: 'approval-1',
          toolCallId: 'missing',
        },
      }),
    ).rejects.toThrow(
      "tool call 'missing' was not found for approval 'approval-1'",
    );
  });

  test('passes approval responses through without looking up the tool call', async () => {
    const part: Extract<
      HarnessAgentStreamPart,
      { type: 'tool-approval-response' }
    > = {
      type: 'tool-approval-response',
      approvalId: 'approval-1',
      toolCall: {
        type: 'tool-call',
        toolCallId: 'call-1',
        toolName: 'weather',
        input: { city: 'Berlin' },
        providerMetadata: { test: { key: 'value' } },
      },
      approved: true,
      reason: 'Trusted',
      providerExecuted: false,
    };

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

  test('translates a typed tool call and its result with the recorded input', async () => {
    const toolCalls = new Map<string, TranslatedToolCall>();

    expect(
      await translate({
        part: {
          type: 'tool-call',
          toolCallId: 'call-1',
          toolName: 'weather',
          input: '{"city":"Berlin"}',
        },
        toolCalls,
      }),
    ).toEqual([
      {
        type: 'tool-call',
        toolCallId: 'call-1',
        toolName: 'weather',
        input: { city: 'Berlin' },
      },
    ]);
    expect(
      await translate({
        part: {
          type: 'tool-result',
          toolCallId: 'call-1',
          toolName: 'weather',
          result: { temperature: 20 },
        },
        toolCalls,
      }),
    ).toEqual([
      {
        type: 'tool-result',
        toolCallId: 'call-1',
        toolName: 'weather',
        input: { city: 'Berlin' },
        output: { temperature: 20 },
      },
    ]);
    expect(
      await translate({
        part: {
          type: 'tool-result',
          toolCallId: 'call-1',
          toolName: 'weather',
          result: 'failed',
          isError: true,
        },
        toolCalls,
      }),
    ).toEqual([
      {
        type: 'tool-error',
        toolCallId: 'call-1',
        toolName: 'weather',
        input: { city: 'Berlin' },
        error: 'failed',
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
