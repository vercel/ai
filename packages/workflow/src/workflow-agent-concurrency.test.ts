import type { LanguageModelV4GenerateResult } from '@ai-sdk/provider';
import { DelayedPromise } from '@ai-sdk/provider-utils';
import { isStepCount, tool, type ModelMessage } from 'ai';
import { MockLanguageModelV4, convertArrayToReadableStream } from 'ai/test';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod/v4';
import { WorkflowAgent } from './workflow-agent.js';

const ids = ['first', 'second', 'third'];
const usage = {
  inputTokens: {
    total: 1,
    noCache: 1,
    cacheRead: undefined,
    cacheWrite: undefined,
  },
  outputTokens: { total: 1, text: 1, reasoning: undefined },
};

function model(content: LanguageModelV4GenerateResult['content']) {
  return new MockLanguageModelV4({
    doGenerate: {
      content,
      finishReason: { unified: 'stop', raw: undefined },
      usage,
      warnings: [],
    },
    doStream: {
      stream: convertArrayToReadableStream([
        { type: 'stream-start', warnings: [] },
        ...content.flatMap(part => {
          if (part.type === 'tool-call') return [part];
          return [];
        }),
        {
          type: 'finish',
          finishReason: { unified: 'stop', raw: undefined },
          usage,
        },
      ]),
    },
  });
}

function calls() {
  return ids.map(id => ({
    type: 'tool-call' as const,
    toolCallId: id,
    toolName: 'action',
    input: JSON.stringify({ id }),
  }));
}

function approvalMessages(): ModelMessage[] {
  return [
    { role: 'user', content: 'Run the tools.' },
    {
      role: 'assistant',
      content: ids.flatMap(id => [
        {
          type: 'tool-call' as const,
          toolCallId: id,
          toolName: 'action',
          input: { id },
        },
        {
          type: 'tool-approval-request' as const,
          toolCallId: id,
          approvalId: `approval-${id}`,
        },
      ]),
    },
    {
      role: 'tool',
      // Execution order follows model calls, even if responses arrive reversed.
      content: [...ids].reverse().map(id => ({
        type: 'tool-approval-response' as const,
        approvalId: `approval-${id}`,
        approved: true,
      })),
    },
  ];
}

for (const mode of ['generate', 'stream'] as const) {
  describe(`WorkflowAgent.${mode} toolCallConcurrency`, () => {
    for (const path of ['normal', 'paused', 'approved'] as const) {
      it.each([undefined, 1, 2])(
        `${path}: limits execution to %s and preserves result order`,
        async concurrency => {
          const started: string[] = [];
          const gates = ids.map(() => new DelayedPromise<void>());
          const m = model(
            path === 'approved'
              ? []
              : [
                  ...calls(),
                  ...(path === 'paused'
                    ? [
                        {
                          type: 'tool-call' as const,
                          toolCallId: 'paused',
                          toolName: 'paused',
                          input: '{}',
                        },
                      ]
                    : []),
                ],
          );
          const agent = new WorkflowAgent({
            model: m,
            toolCallConcurrency: concurrency,
            stopWhen: isStepCount(1),
            tools: {
              action: tool({
                inputSchema: z.object({ id: z.string() }),
                needsApproval: path === 'approved',
                execute: async ({ id }) => {
                  started.push(id);
                  await gates[ids.indexOf(id)].promise;
                  return id;
                },
              }),
              paused: tool({ inputSchema: z.object({}) }),
            },
          });
          const pending = agent[mode]({
            messages:
              path === 'approved'
                ? approvalMessages()
                : [{ role: 'user', content: 'Run the tools.' }],
          });
          const initial = concurrency ?? ids.length;
          await vi.waitFor(() =>
            expect(started).toEqual(ids.slice(0, initial)),
          );
          // Finish the most recently started call first. Each completion opens
          // exactly one slot and results must still retain the model's order.
          if (initial === 1) {
            gates[0].resolve();
            await vi.waitFor(() => expect(started).toEqual(ids.slice(0, 2)));
          }
          gates[1].resolve();
          await vi.waitFor(() => expect(started).toEqual(ids));
          gates[2].resolve();
          gates[0].resolve();
          const result = await pending;
          const messages =
            'responseMessages' in result
              ? result.responseMessages
              : result.messages;
          const outputs = messages
            .filter(message => message.role === 'tool')
            .flatMap(message => message.content)
            .filter(part => part.type === 'tool-result');
          expect(outputs.map(part => part.toolCallId)).toEqual(ids);
        },
      );
    }

    it.each([
      { constructor: 1, prepared: undefined, call: undefined, expected: 1 },
      { constructor: 1, prepared: 2, call: undefined, expected: 2 },
      { constructor: 1, prepared: 2, call: 3, expected: 3 },
    ])('resolves constructor < prepareCall < call: %j', async settings => {
      let active = 0;
      let peak = 0;
      const prepareCall = vi.fn(options => {
        expect(options.toolCallConcurrency).toBe(
          settings.call ?? settings.constructor,
        );
        return { toolCallConcurrency: settings.prepared };
      });
      const agent = new WorkflowAgent({
        model: model(calls()),
        stopWhen: isStepCount(1),
        toolCallConcurrency: settings.constructor,
        prepareCall,
        tools: {
          action: tool({
            inputSchema: z.object({ id: z.string() }),
            execute: async () => {
              peak = Math.max(peak, ++active);
              await Promise.resolve();
              active--;
              return 'done';
            },
          }),
        },
      });
      await agent[mode]({
        prompt: 'Run tools.',
        toolCallConcurrency: settings.call,
      });
      expect(peak).toBe(settings.expected);
      expect(prepareCall).toHaveBeenCalledOnce();
    });

    it.each([0, -1, 1.5, NaN, Infinity])(
      'rejects invalid concurrency %s before executing approved tools or calling the model',
      async toolCallConcurrency => {
        const execute = vi.fn(async () => 'done');
        const m = model([]);
        const agent = new WorkflowAgent({
          model: m,
          toolCallConcurrency,
          tools: {
            action: tool({
              inputSchema: z.object({ id: z.string() }),
              needsApproval: true,
              execute,
            }),
          },
        });
        await expect(
          agent[mode]({ messages: approvalMessages() }),
        ).rejects.toMatchObject({ parameter: 'toolCallConcurrency' });
        expect(execute).not.toHaveBeenCalled();
        expect(m.doGenerateCalls).toHaveLength(0);
        expect(m.doStreamCalls).toHaveLength(0);
      },
    );

    it('continues queued calls after a tool error', async () => {
      const started: string[] = [];
      const agent = new WorkflowAgent({
        model: model(calls()),
        stopWhen: isStepCount(1),
        toolCallConcurrency: 1,
        tools: {
          action: tool({
            inputSchema: z.object({ id: z.string() }),
            execute: async ({ id }) => {
              started.push(id);
              if (id === 'first') throw new Error('tool failed');
              return id;
            },
          }),
        },
      });
      await agent[mode]({ prompt: 'Run tools.' });
      expect(started).toEqual(ids);
    });

    it('does not start queued calls after abort', async () => {
      const abort = new AbortController();
      const started: string[] = [];
      const agent = new WorkflowAgent({
        model: model(calls()),
        toolCallConcurrency: 1,
        tools: {
          action: tool({
            inputSchema: z.object({ id: z.string() }),
            execute: async ({ id }) => {
              started.push(id);
              abort.abort(new DOMException('cancelled', 'AbortError'));
              return id;
            },
          }),
        },
      });
      const pending = agent[mode]({
        prompt: 'Run tools.',
        abortSignal: abort.signal,
      });
      await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
      expect(started).toEqual(['first']);
    });
  });
}
