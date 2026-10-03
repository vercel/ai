import {
  DelayedPromise,
  tool,
  type ModelMessage,
} from '@ai-sdk/provider-utils';
import { convertArrayToReadableStream } from '@ai-sdk/provider-utils/test';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod/v4';
import { MockLanguageModelV4 } from '../test/mock-language-model-v4';
import { generateText } from './generate-text';
import { parseToolCall } from './parse-tool-call';
import { streamText } from './stream-text';

const toolCall = {
  type: 'tool-call' as const,
  toolCallId: 'call-1',
  toolName: 'testTool',
  input: '{"value":"test"}',
};
const tools = {
  testTool: tool({ inputSchema: z.object({ value: z.string() }) }),
};

describe('tool input refinement cancellation', () => {
  afterEach(() => vi.useRealTimers());

  it.each(['ordinary', 'dynamic', 'dynamic without tools', 'repaired'])(
    'should stop waiting for %s refinement when aborted',
    async path => {
      const controller = new AbortController();
      const started = new DelayedPromise<void>();
      const refinement = new DelayedPromise<{ value: string }>();
      const reason = new Error('cancelled during refinement');
      const result = parseToolCall({
        toolCall:
          path === 'repaired'
            ? { ...toolCall, input: 'invalid json' }
            : path.startsWith('dynamic')
              ? { ...toolCall, providerExecuted: true, dynamic: true }
              : toolCall,
        tools:
          path === 'dynamic without tools'
            ? undefined
            : path === 'dynamic'
              ? {}
              : tools,
        repairToolCall: async () => toolCall,
        refineToolInput: {
          testTool: () => {
            started.resolve(undefined);
            return refinement.promise;
          },
        },
        messages: [],
        instructions: undefined,
        abortSignal: controller.signal,
      });

      await started.promise;
      controller.abort(reason);
      try {
        await expect(result).rejects.toBe(reason);
      } finally {
        // A later rejection must remain observed after cancellation.
        refinement.reject(new Error('late refinement failure'));
      }
    },
  );

  it('should not invoke refinement when already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    const refine = vi.fn(input => input);

    await expect(
      parseToolCall({
        toolCall,
        tools,
        repairToolCall: undefined,
        refineToolInput: { testTool: refine },
        messages: [],
        instructions: undefined,
        abortSignal: controller.signal,
      }),
    ).rejects.toBe(controller.signal.reason);
    expect(refine).not.toHaveBeenCalled();
  });

  it('should preserve synchronous cancellation and observe refinement rejection', async () => {
    const controller = new AbortController();
    const reason = new Error('cancelled');
    await expect(
      parseToolCall({
        toolCall,
        tools,
        repairToolCall: undefined,
        refineToolInput: {
          testTool: async () => {
            controller.abort(reason);
            throw new Error('refinement failed');
          },
        },
        messages: [],
        instructions: undefined,
        abortSignal: controller.signal,
      }),
    ).rejects.toBe(reason);
  });

  describe.each(['generateText', 'streamText'] as const)('%s', api => {
    it.each([
      { approved: false, cancel: 'abort' },
      { approved: false, cancel: 'step timeout' },
      { approved: true, cancel: 'abort' },
      { approved: true, cancel: 'total timeout' },
    ])(
      'should stop refinement on $cancel (approved: $approved)',
      async ({ approved, cancel }) => {
        vi.useFakeTimers();
        const controller = new AbortController();
        const started = new DelayedPromise<void>();
        const refinement = new DelayedPromise<{ value: string }>();
        const execute = vi.fn(async () => 'tool result');
        const onError = vi.fn();
        const onAbort = vi.fn();
        const finish = {
          finishReason: { unified: 'tool-calls', raw: 'tool-calls' } as const,
          usage: {
            inputTokens: {
              total: 1,
              noCache: 1,
              cacheRead: undefined,
              cacheWrite: undefined,
            },
            outputTokens: { total: 1, text: 1, reasoning: undefined },
          },
        };
        const model = new MockLanguageModelV4({
          doGenerate: { content: [toolCall], ...finish, warnings: [] },
          doStream: {
            stream: convertArrayToReadableStream([
              toolCall,
              { type: 'finish', ...finish },
            ]),
          },
        });
        const messages: ModelMessage[] = [{ role: 'user', content: 'test' }];
        if (approved) {
          messages.push(
            {
              role: 'assistant',
              content: [
                { ...toolCall, input: { value: 'test' } },
                {
                  type: 'tool-approval-request',
                  approvalId: 'approval-1',
                  toolCallId: 'call-1',
                },
              ],
            },
            {
              role: 'tool',
              content: [
                {
                  type: 'tool-approval-response',
                  approvalId: 'approval-1',
                  approved: true,
                },
              ],
            },
          );
        }
        const options = {
          model,
          messages,
          tools: {
            testTool: tool({
              inputSchema: z.object({ value: z.string() }),
              execute,
            }),
          },
          experimental_refineToolInput: {
            testTool: () => {
              started.resolve(undefined);
              return refinement.promise;
            },
          },
          abortSignal: controller.signal,
          timeout:
            cancel === 'step timeout'
              ? { stepMs: 50 }
              : cancel === 'total timeout'
                ? { totalMs: 50 }
                : undefined,
        };
        const result =
          api === 'generateText'
            ? generateText(options)
            : streamText({ ...options, onError, onAbort }).consumeStream();
        // Attach the rejection handler before triggering cancellation.
        const settled = result.then(
          () => ({ error: undefined }),
          error => ({ error }),
        );
        await started.promise;
        if (cancel === 'abort') {
          controller.abort();
        } else {
          await vi.advanceTimersByTimeAsync(50);
        }
        try {
          const outcome = await settled;
          if (api === 'generateText') {
            expect(outcome.error).toMatchObject({
              name: cancel === 'abort' ? 'AbortError' : 'TimeoutError',
            });
          } else {
            expect(onError).not.toHaveBeenCalled();
            expect(onAbort).toHaveBeenCalledOnce();
          }
          expect(execute).not.toHaveBeenCalled();
          if (approved) {
            expect(model.doGenerateCalls).toHaveLength(0);
            expect(model.doStreamCalls).toHaveLength(0);
          }
        } finally {
          refinement.resolve({ value: 'test' });
        }
      },
    );
  });
});
