import type { LanguageModelV4Usage } from '@ai-sdk/provider';
import { dynamicTool, type ModelMessage, tool } from '@ai-sdk/provider-utils';
import { convertArrayToReadableStream } from '@ai-sdk/provider-utils/test';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod/v4';
import { MissingToolResultsError } from '../error/missing-tool-result-error';
import { MockLanguageModelV4 } from '../test/mock-language-model-v4';
import { convertToModelMessages } from '../ui/convert-to-model-messages';
import type { UIMessage } from '../ui/ui-messages';
import { generateText } from './generate-text';
import { streamText } from './stream-text';
import { signToolApproval } from './tool-approval-signature';

const usage: LanguageModelV4Usage = {
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
    it.each(
      (['toolMetadata', 'dynamic', 'title'] as const).flatMap(field =>
        [undefined, 'test-secret'].map(secret => ({ field, secret })),
      ),
    )(
      'should enforce the current $field policy on continuation (secret: $secret)',
      async ({ field, secret }) => {
        const execute = vi.fn(async () => 'dark');
        const definition = {
          inputSchema: z.object({}),
          metadata: { restricted: true },
          title: 'Read theme',
          execute,
        };
        const tools = {
          readTheme:
            field === 'dynamic' ? dynamicTool(definition) : tool(definition),
        };
        const signature =
          secret == null
            ? undefined
            : await signToolApproval({
                secret,
                approvalId: 'approval',
                toolCallId: 'call',
                toolName: 'readTheme',
                input: {},
              });
        const messages = await convertToModelMessages(
          [
            {
              id: 'assistant',
              role: 'assistant',
              parts: [
                {
                  type: 'tool-readTheme',
                  toolCallId: 'call',
                  state: 'approval-responded',
                  input: {},
                  approval: { id: 'approval', approved: true, signature },
                },
              ],
            },
          ],
          { tools },
        );
        const originalMessages = structuredClone(messages);
        const model = new MockLanguageModelV4({
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
        const options = {
          model,
          tools,
          messages,
          experimental_toolApprovalSecret: secret,
          toolApproval: vi.fn(({ toolCall }) => {
            const denied =
              field === 'toolMetadata'
                ? toolCall.toolMetadata?.restricted === true
                : field === 'dynamic'
                  ? toolCall.dynamic === true
                  : toolCall.title === 'Read theme';
            return denied
              ? ({
                  type: 'denied',
                  reason: 'Current policy denies this tool',
                } as const)
              : ('user-approval' as const);
          }),
        };
        let responseMessages: ModelMessage[];
        if (api === 'generateText') {
          responseMessages = (await generateText(options)).responseMessages;
        } else {
          const onError = vi.fn();
          const result = streamText({ ...options, onError });
          await result.consumeStream();
          expect(onError).not.toHaveBeenCalled();
          responseMessages = await result.responseMessages;
        }

        expect(execute).not.toHaveBeenCalled();
        expect(options.toolApproval).toHaveBeenCalledOnce();
        expect(messages).toEqual(originalMessages);
        const results = responseMessages
          .filter(message => message.role === 'tool')
          .flatMap(message => message.content)
          .filter(part => part.type === 'tool-result');
        expect(results).toMatchObject([
          {
            toolCallId: 'call',
            output: {
              type: 'execution-denied',
              reason: 'Current policy denies this tool',
            },
          },
        ]);
      },
    );

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
        const originalMessages = structuredClone(messages);
        const model = new MockLanguageModelV4({
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
        const options = {
          model,
          messages,
          tools: {
            set_theme: tool({ inputSchema: z.object({}), execute }),
          },
          toolApproval: { set_theme: 'user-approval' as const },
        };
        let responseMessages: ModelMessage[];
        if (api === 'generateText') {
          responseMessages = (await generateText(options)).responseMessages;
        } else {
          const onError = vi.fn();
          const result = streamText({ ...options, onError });
          await result.consumeStream();
          expect(onError).not.toHaveBeenCalled();
          responseMessages = await result.responseMessages;
        }

        expect(execute).toHaveBeenCalledTimes(approved ? 1 : 0);
        expect(messages).toEqual(originalMessages);
        const results = responseMessages
          .filter(message => message.role === 'tool')
          .flatMap(message => message.content)
          .filter(part => part.type === 'tool-result');
        expect(results).toHaveLength(1);
        expect(results[0].output).toEqual(
          approved
            ? { type: 'text', value: 'saved' }
            : { type: 'execution-denied', reason: 'test-reason' },
        );
        const calls =
          api === 'generateText' ? model.doGenerateCalls : model.doStreamCalls;
        expect(calls).toHaveLength(1);
        expect(
          calls[0].prompt
            .filter(message => message.role === 'tool')
            .flatMap(message => message.content)
            .filter(part => part.type === 'tool-result'),
        ).toHaveLength(1);
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
          set_theme: tool({ inputSchema: z.object({}), execute }),
        };
        const model = new MockLanguageModelV4({
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
          toolApproval: { set_theme: 'user-approval' as const },
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
