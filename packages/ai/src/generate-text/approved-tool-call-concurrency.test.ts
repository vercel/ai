import type { LanguageModelV4Usage } from '@ai-sdk/provider';
import {
  DelayedPromise,
  tool,
  type ModelMessage,
} from '@ai-sdk/provider-utils';
import { convertArrayToReadableStream } from '@ai-sdk/provider-utils/test';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod/v4';
import { MockLanguageModelV4 } from '../test/mock-language-model-v4';
import { generateText } from './generate-text';
import { streamText } from './stream-text';

describe('approved tool call concurrency', () => {
  it.each(['generateText', 'streamText'] as const)(
    '%s should execute approved calls in model order with reversed approval responses',
    async api => {
      const releaseFirst = new DelayedPromise<void>();
      const events: string[] = [];
      let document = 'original';
      let readDocument: string | undefined;
      const usage: LanguageModelV4Usage = {
        inputTokens: {
          total: 0,
          noCache: 0,
          cacheRead: undefined,
          cacheWrite: undefined,
        },
        outputTokens: { total: 0, text: 0, reasoning: undefined },
      };
      const model = new MockLanguageModelV4({
        doGenerate: {
          content: [{ type: 'text', text: 'Done' }],
          finishReason: { unified: 'stop', raw: 'stop' },
          usage,
          warnings: [],
        },
        doStream: {
          stream: convertArrayToReadableStream([
            { type: 'stream-start', warnings: [] },
            { type: 'text-start', id: 'text-1' },
            { type: 'text-delta', id: 'text-1', delta: 'Done' },
            { type: 'text-end', id: 'text-1' },
            {
              type: 'finish',
              finishReason: { unified: 'stop', raw: 'stop' },
              usage,
            },
          ]),
        },
      });
      const messages: ModelMessage[] = [
        { role: 'user', content: 'Update the document and read it.' },
        {
          role: 'assistant',
          content: [
            {
              type: 'tool-call',
              toolCallId: 'call-1',
              toolName: 'first',
              input: {},
            },
            {
              type: 'tool-call',
              toolCallId: 'call-2',
              toolName: 'second',
              input: {},
            },
            {
              type: 'tool-approval-request',
              approvalId: 'approval-1',
              toolCallId: 'call-1',
            },
            {
              type: 'tool-approval-request',
              approvalId: 'approval-2',
              toolCallId: 'call-2',
            },
          ],
        },
        {
          role: 'tool',
          content: [
            {
              type: 'tool-approval-response',
              approvalId: 'approval-2',
              approved: true,
            },
            {
              type: 'tool-approval-response',
              approvalId: 'approval-1',
              approved: true,
            },
          ],
        },
      ];
      const options = {
        model,
        messages,
        toolCallConcurrency: 1,
        tools: {
          first: tool({
            inputSchema: z.object({}),
            needsApproval: true,
            execute: async () => {
              events.push('first:start');
              await releaseFirst.promise;
              document = 'updated';
              events.push('first:end');
              return document;
            },
          }),
          second: tool({
            inputSchema: z.object({}),
            needsApproval: true,
            execute: async () => {
              events.push('second:start');
              readDocument = document;
              events.push('second:end');
              return readDocument;
            },
          }),
        },
      };

      const textPromise =
        api === 'generateText'
          ? generateText(options).then(result => result.text)
          : streamText(options).text;

      try {
        await vi.waitFor(() => expect(events).toEqual(['first:start']));
      } finally {
        releaseFirst.resolve();
        await textPromise;
      }

      expect(events).toEqual([
        'first:start',
        'first:end',
        'second:start',
        'second:end',
      ]);
      expect(readDocument).toBe('updated');
      expect(await textPromise).toBe('Done');
    },
  );
});
