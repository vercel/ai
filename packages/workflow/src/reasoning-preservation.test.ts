import type {
  LanguageModelV4Prompt,
  LanguageModelV4StreamPart,
  LanguageModelV4ToolResultPart,
} from '@ai-sdk/provider';
import { tool, type ToolSet } from 'ai';
import { MockLanguageModelV4, convertArrayToReadableStream } from 'ai/test';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { streamTextIterator } from './stream-text-iterator.js';

function finishPart(
  finishReason: 'stop' | 'tool-calls',
): LanguageModelV4StreamPart {
  return {
    type: 'finish',
    finishReason: {
      unified: finishReason,
      raw: finishReason === 'tool-calls' ? 'tool_calls' : 'stop',
    },
    usage: {
      inputTokens: {
        total: 1,
        noCache: 1,
        cacheRead: undefined,
        cacheWrite: undefined,
      },
      outputTokens: {
        total: 1,
        text: undefined,
        reasoning: 1,
      },
    },
  };
}

describe('WorkflowAgent reasoning preservation', () => {
  it('carries reasoning and provider metadata into the next model turn', async () => {
    let callCount = 0;
    let secondTurnPrompt: LanguageModelV4Prompt | undefined;
    const model = new MockLanguageModelV4({
      doStream: async options => {
        if (callCount++ === 0) {
          return {
            stream: convertArrayToReadableStream<LanguageModelV4StreamPart>([
              { type: 'stream-start', warnings: [] },
              {
                type: 'reasoning-start',
                id: 'reasoning-1',
                providerMetadata: {
                  openai: {
                    itemId: 'rs_reasoning_item',
                    reasoningEncryptedContent: 'encrypted-reasoning',
                  },
                },
              },
              { type: 'reasoning-end', id: 'reasoning-1' },
              {
                type: 'tool-call',
                toolCallId: 'call-1',
                toolName: 'lookup',
                input: '{"query":"weather"}',
                providerMetadata: {
                  openai: { itemId: 'fc_requires_reasoning' },
                },
              },
              finishPart('tool-calls'),
            ]),
          };
        }

        secondTurnPrompt = options.prompt;
        return {
          stream: convertArrayToReadableStream<LanguageModelV4StreamPart>([
            { type: 'stream-start', warnings: [] },
            finishPart('stop'),
          ]),
        };
      },
    });
    const tools = {
      lookup: tool({
        description: 'Look up information',
        inputSchema: z.object({ query: z.string() }),
      }),
    } satisfies ToolSet;

    const iterator = streamTextIterator({
      prompt: [{ role: 'user', content: [{ type: 'text', text: 'test' }] }],
      tools,
      model,
    });

    const firstTurn = await iterator.next();
    expect(firstTurn.done).toBe(false);
    const toolResults: LanguageModelV4ToolResultPart[] = [
      {
        type: 'tool-result',
        toolCallId: 'call-1',
        toolName: 'lookup',
        output: { type: 'json', value: { ok: true } },
      },
    ];
    await iterator.next(toolResults);

    const assistantMessage = secondTurnPrompt?.find(
      message => message.role === 'assistant',
    );
    expect(assistantMessage?.content).toEqual([
      {
        type: 'reasoning',
        text: '',
        providerOptions: {
          openai: {
            itemId: 'rs_reasoning_item',
            reasoningEncryptedContent: 'encrypted-reasoning',
          },
        },
      },
      {
        type: 'tool-call',
        toolCallId: 'call-1',
        toolName: 'lookup',
        input: { query: 'weather' },
        providerOptions: {
          openai: { itemId: 'fc_requires_reasoning' },
        },
      },
    ]);
  });

  it('preserves interleaved reasoning files and tool calls end to end', async () => {
    let callCount = 0;
    let secondTurnPrompt: LanguageModelV4Prompt | undefined;
    const model = new MockLanguageModelV4({
      doStream: async options => {
        if (callCount++ === 0) {
          return {
            stream: convertArrayToReadableStream<LanguageModelV4StreamPart>([
              { type: 'stream-start', warnings: [] },
              { type: 'reasoning-start', id: 'reasoning-1' },
              {
                type: 'reasoning-delta',
                id: 'reasoning-1',
                delta: 'first',
              },
              { type: 'reasoning-end', id: 'reasoning-1' },
              {
                type: 'tool-call',
                toolCallId: 'call-1',
                toolName: 'lookup',
                input: '{"query":"first"}',
              },
              {
                type: 'reasoning-file',
                data: { type: 'data', data: 'c2lnbmVkLXRob3VnaHQ=' },
                mediaType: 'application/octet-stream',
                providerMetadata: {
                  google: { thoughtSignature: 'file-signature' },
                },
              },
              { type: 'reasoning-start', id: 'reasoning-2' },
              {
                type: 'reasoning-delta',
                id: 'reasoning-2',
                delta: 'second',
              },
              { type: 'reasoning-end', id: 'reasoning-2' },
              {
                type: 'tool-call',
                toolCallId: 'call-2',
                toolName: 'lookup',
                input: '{"query":"second"}',
              },
              finishPart('tool-calls'),
            ]),
          };
        }

        secondTurnPrompt = options.prompt;
        return {
          stream: convertArrayToReadableStream<LanguageModelV4StreamPart>([
            { type: 'stream-start', warnings: [] },
            finishPart('stop'),
          ]),
        };
      },
    });
    const tools = {
      lookup: tool({
        description: 'Look up information',
        inputSchema: z.object({ query: z.string() }),
      }),
    } satisfies ToolSet;

    const iterator = streamTextIterator({
      prompt: [{ role: 'user', content: [{ type: 'text', text: 'test' }] }],
      tools,
      model,
    });

    await iterator.next();
    await iterator.next([
      {
        type: 'tool-result',
        toolCallId: 'call-1',
        toolName: 'lookup',
        output: { type: 'json', value: { ok: true } },
      },
      {
        type: 'tool-result',
        toolCallId: 'call-2',
        toolName: 'lookup',
        output: { type: 'json', value: { ok: true } },
      },
    ]);

    const assistantMessage = secondTurnPrompt?.find(
      message => message.role === 'assistant',
    );
    expect(assistantMessage?.content).toEqual([
      { type: 'reasoning', text: 'first' },
      {
        type: 'tool-call',
        toolCallId: 'call-1',
        toolName: 'lookup',
        input: { query: 'first' },
      },
      {
        type: 'reasoning-file',
        data: { type: 'data', data: 'c2lnbmVkLXRob3VnaHQ=' },
        mediaType: 'application/octet-stream',
        providerOptions: {
          google: { thoughtSignature: 'file-signature' },
        },
      },
      { type: 'reasoning', text: 'second' },
      {
        type: 'tool-call',
        toolCallId: 'call-2',
        toolName: 'lookup',
        input: { query: 'second' },
      },
    ]);
  });
});
