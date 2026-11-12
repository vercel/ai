import { tool } from '@ai-sdk/provider-utils';
import { describe, expect, test } from 'vitest';
import { z } from 'zod/v4';
import { HarnessEffectError } from '../../../errors/harness-effect-error';
import {
  translateStreamPart,
  type TranslatedToolCall,
} from './translate-stream-part';
import type { HarnessAgentStreamPart } from './types';

const tools = {
  weather: tool({ inputSchema: z.object({ city: z.string() }) }),
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

describe('translateStreamPart', () => {
  test('translates start and text parts', async () => {
    expect(await translate({ part: { type: 'start' } })).toEqual([
      { type: 'start' },
    ]);
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
