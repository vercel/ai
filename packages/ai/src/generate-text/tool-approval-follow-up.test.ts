import type { LanguageModelV3Usage } from '@ai-sdk/provider';
import { type ModelMessage, tool } from '@ai-sdk/provider-utils';
import { convertArrayToReadableStream } from '@ai-sdk/provider-utils/test';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod/v4';
import { MissingToolResultsError } from '../error/missing-tool-result-error';
import { MockLanguageModelV3 } from '../test/mock-language-model-v3';
import { convertToModelMessages } from '../ui/convert-to-model-messages';
import type { UIMessage } from '../ui/ui-messages';
import { generateText } from './generate-text';
import { streamText } from './stream-text';

const usage: LanguageModelV3Usage = {
  inputTokens: {
    total: 1,
    noCache: 1,
    cacheRead: undefined,
    cacheWrite: undefined,
  },
  outputTokens: { total: 1, text: 1, reasoning: undefined },
};

describe.each(['generateText', 'streamText'] as const)(
  '%s approved tool continuation',
  api => {
    it.each([
      { approved: true, replayApproved: true },
      { approved: false, replayApproved: false },
      { approved: true, replayApproved: false },
      { approved: false, replayApproved: true },
    ])(
      'should process only the first of repeated approval responses: %j',
      async ({ approved, replayApproved }) => {
        const execute = vi.fn(async () => 'saved');
        const approvalResponse = {
          type: 'tool-approval-response' as const,
          approvalId: 'approval',
          approved,
          reason: 'test-reason',
        };
        const model = new MockLanguageModelV3({
          doGenerate: {
            content: [{ type: 'text', text: 'OK' }],
            finishReason: { unified: 'stop', raw: 'stop' },
            usage,
            warnings: [],
          },
          doStream: {
            stream: convertArrayToReadableStream([
              { type: 'stream-start', warnings: [] },
              {
                type: 'finish',
                finishReason: { unified: 'stop', raw: 'stop' },
                usage,
              },
            ]),
          },
        });
        const messages: ModelMessage[] = [
          {
            role: 'assistant',
            content: [
              {
                type: 'tool-call',
                toolCallId: 'call',
                toolName: 'set_theme',
                input: {},
              },
              {
                type: 'tool-approval-request',
                approvalId: 'approval',
                toolCallId: 'call',
              },
            ],
          },
          {
            role: 'tool',
            content: [
              approvalResponse,
              { ...approvalResponse, approved: replayApproved },
            ],
          },
        ];
        const options = {
          model,
          messages,
          tools: {
            set_theme: tool({
              inputSchema: z.object({}),
              execute,
              needsApproval: true,
            }),
          },
        };

        if (api === 'generateText') {
          await generateText(options);
        } else {
          const onError = vi.fn();
          await streamText({ ...options, onError }).consumeStream();
          expect(onError).not.toHaveBeenCalled();
        }

        expect(execute).toHaveBeenCalledTimes(approved ? 1 : 0);
        const calls =
          api === 'generateText' ? model.doGenerateCalls : model.doStreamCalls;
        expect(calls).toHaveLength(1);
        expect(
          calls[0].prompt
            .filter(message => message.role === 'tool')
            .flatMap(message => message.content)
            .filter(part => part.type === 'tool-result'),
        ).toMatchObject([
          {
            toolCallId: 'call',
            output: approved
              ? { type: 'text', value: 'saved' }
              : { type: 'execution-denied', reason: 'test-reason' },
          },
        ]);
      },
    );

    it.each([
      'unresolved-follow-up',
      'immediate',
      'completed-follow-up',
    ] as const)(
      'should validate %s before calling the provider',
      async sequence => {
        const execute = vi.fn(async () => 'saved');
        const tools = {
          set_theme: tool({
            inputSchema: z.object({}),
            execute,
            needsApproval: true,
          }),
        };
        const model = new MockLanguageModelV3({
          doGenerate: {
            content: [{ type: 'text', text: 'OK' }],
            finishReason: { unified: 'stop', raw: 'stop' },
            usage,
            warnings: [],
          },
          doStream: {
            stream: convertArrayToReadableStream([
              { type: 'stream-start', warnings: [] },
              {
                type: 'finish',
                finishReason: { unified: 'stop', raw: 'stop' },
                usage,
              },
            ]),
          },
        });
        const messages: UIMessage[] = [
          {
            id: 'assistant',
            role: 'assistant',
            parts: [
              {
                type: 'tool-set_theme',
                toolCallId: 'call',
                input: {},
                approval: { id: 'approval', approved: true },
                ...(sequence === 'completed-follow-up'
                  ? { state: 'output-available' as const, output: 'saved' }
                  : { state: 'approval-responded' as const }),
              },
            ],
          },
        ];
        if (sequence !== 'immediate') {
          messages.push({
            id: 'user',
            role: 'user',
            parts: [{ type: 'text', text: 'Reply with OK.' }],
          });
        }
        const options = {
          model,
          tools,
          messages: await convertToModelMessages(messages, {
            tools,
            ignoreIncompleteToolCalls: true,
          }),
        };
        const shouldReject = sequence === 'unresolved-follow-up';

        if (api === 'generateText') {
          const result = generateText(options);
          if (shouldReject) {
            await expect(result).rejects.toMatchObject({
              name: 'AI_MissingToolResultsError',
              toolCallIds: ['call'],
            });
          } else {
            await result;
          }
        } else {
          const onError = vi.fn();
          await streamText({ ...options, onError }).consumeStream();
          if (shouldReject) {
            expect(onError).toHaveBeenCalledExactlyOnceWith({
              error: expect.any(MissingToolResultsError),
            });
            expect(onError.mock.calls[0][0].error.toolCallIds).toEqual([
              'call',
            ]);
          } else {
            expect(onError).not.toHaveBeenCalled();
          }
        }

        expect(execute).toHaveBeenCalledTimes(sequence === 'immediate' ? 1 : 0);
        const calls =
          api === 'generateText' ? model.doGenerateCalls : model.doStreamCalls;
        expect(calls).toHaveLength(shouldReject ? 0 : 1);
        if (!shouldReject) {
          expect(calls[0].prompt[1]).toMatchObject({
            role: 'tool',
            content: [{ type: 'tool-result', toolCallId: 'call' }],
          });
        }
      },
    );
  },
);
