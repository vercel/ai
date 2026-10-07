import type { LanguageModelV4StreamPart } from '@ai-sdk/provider';
import { DelayedPromise, tool } from '@ai-sdk/provider-utils';
import {
  convertArrayToReadableStream,
  convertReadableStreamToArray,
} from '@ai-sdk/provider-utils/test';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod/v4';
import { MockLanguageModelV4 } from '../test/mock-language-model-v4';
import { createMockServerResponse } from '../test/mock-server-response';
import type { UIMessage } from '../ui/ui-messages';
import { createAgentUIStream } from './create-agent-ui-stream';
import { createAgentUIStreamResponse } from './create-agent-ui-stream-response';
import { ToolLoopAgent } from './tool-loop-agent';
import { pipeAgentUIStreamToResponse } from './pipe-agent-ui-stream-to-response';

const uiMessages: UIMessage[] = [
  { id: 'user-1', role: 'user', parts: [{ type: 'text', text: 'Hello' }] },
];

function createModel(...steps: LanguageModelV4StreamPart[][]) {
  return new MockLanguageModelV4({
    doStream: steps.map((parts, index) => ({
      stream: convertArrayToReadableStream<LanguageModelV4StreamPart>([
        { type: 'stream-start', warnings: [] },
        ...parts,
        {
          type: 'finish',
          finishReason: {
            unified: index < steps.length - 1 ? 'tool-calls' : 'stop',
            raw: index < steps.length - 1 ? 'tool-calls' : 'stop',
          },
          usage: {
            inputTokens: {
              total: index + 1,
              noCache: index + 1,
              cacheRead: undefined,
              cacheWrite: undefined,
            },
            outputTokens: { total: 1, text: 1, reasoning: undefined },
          },
        },
      ]),
    })),
  });
}

function textParts(text: string): LanguageModelV4StreamPart[] {
  return [
    { type: 'text-start', id: 'text-1' },
    { type: 'text-delta', id: 'text-1', delta: text },
    { type: 'text-end', id: 'text-1' },
  ];
}

describe('agent UI stream onStepEnd', () => {
  it.each(['stream', 'response', 'pipe'] as const)(
    'provides accumulated UI snapshots and matching model results through the %s helper',
    async helper => {
      const modelOnStepEnd = vi.fn();
      const onStepEnd = vi.fn();
      const agent = new ToolLoopAgent({
        model: createModel(
          [
            ...textParts('Checking.'),
            {
              type: 'tool-call',
              toolCallId: 'call-1',
              toolName: 'lookup',
              input: '{"value":"test"}',
            },
          ],
          textParts('Done.'),
        ),
        tools: {
          lookup: tool({
            inputSchema: z.object({ value: z.string() }),
            execute: ({ value }) => `Found ${value}`,
          }),
        },
        onStepEnd: modelOnStepEnd,
      });
      const options = {
        agent,
        uiMessages,
        generateMessageId: () => 'assistant-1',
        onStepEnd,
      };

      if (helper === 'stream') {
        await convertReadableStreamToArray(await createAgentUIStream(options));
      } else if (helper === 'response') {
        await (await createAgentUIStreamResponse(options)).text();
      } else {
        const response = createMockServerResponse();
        await pipeAgentUIStreamToResponse({ ...options, response });
        await response.waitForEnd();
      }

      expect(onStepEnd).toHaveBeenCalledTimes(2);
      expect(modelOnStepEnd).toHaveBeenCalledTimes(2);
      const first = onStepEnd.mock.calls[0][0];
      const second = onStepEnd.mock.calls[1][0];
      expect(first.stepNumber).toBe(0);
      expect(first.text).toBe('Checking.');
      expect(first.usage.inputTokens).toBe(1);
      expect(first.toolCalls[0].toolName).toBe('lookup');
      expect(first.staticToolCalls).toEqual(first.toolCalls);
      expect(first.toolResults[0].output).toBe('Found test');
      expect(first.staticToolResults).toEqual(first.toolResults);
      expect(first.dynamicToolCalls).toEqual([]);
      expect(first.dynamicToolResults).toEqual([]);
      expect(first.files).toEqual([]);
      expect(first.sources).toEqual([]);
      expect(first.isContinuation).toBe(false);
      expect(first.responseMessage.id).toBe('assistant-1');
      expect(first.responseMessage.parts).toContainEqual({
        type: 'text',
        text: 'Checking.',
        state: 'done',
      });
      expect(first.responseMessage.parts).toContainEqual(
        expect.objectContaining({
          type: 'tool-lookup',
          state: 'output-available',
          output: 'Found test',
        }),
      );
      expect(first.messages).toEqual([...uiMessages, first.responseMessage]);
      expect(second.stepNumber).toBe(1);
      expect(second.text).toBe('Done.');
      expect(second.usage.inputTokens).toBe(2);
      expect(second.responseMessage.id).toBe('assistant-1');
      expect(second.responseMessage.parts).toEqual(
        expect.arrayContaining([
          { type: 'text', text: 'Checking.', state: 'done' },
          { type: 'text', text: 'Done.', state: 'done' },
        ]),
      );
      expect(first.responseMessage.parts).not.toContainEqual({
        type: 'text',
        text: 'Done.',
        state: 'done',
      });
      for (const [modelEvent] of modelOnStepEnd.mock.calls) {
        expect(modelEvent).not.toHaveProperty('responseMessage');
        expect(modelEvent).not.toHaveProperty('messages');
      }
    },
  );

  it('extends an assistant message and isolates callback mutations from onEnd', async () => {
    const originalMessages: UIMessage[] = [
      {
        id: 'assistant-1',
        role: 'assistant',
        parts: [{ type: 'text', text: 'Earlier', state: 'done' }],
      },
    ];
    const onEnd = vi.fn();
    const onStepEnd = vi.fn(event => {
      expect(event.isContinuation).toBe(true);
      expect(event.responseMessage.id).toBe('assistant-1');
      expect(event.messages).toHaveLength(1);
      event.responseMessage.parts.push({
        type: 'text',
        text: 'Mutation',
        state: 'done',
      });
    });
    await convertReadableStreamToArray(
      await createAgentUIStream({
        agent: new ToolLoopAgent({ model: createModel(textParts('More')) }),
        uiMessages: originalMessages,
        onStepEnd,
        onEnd,
      }),
    );
    expect(onStepEnd).toHaveBeenCalledOnce();
    expect(onEnd.mock.calls[0][0].responseMessage.parts).toEqual(
      expect.arrayContaining([
        { type: 'text', text: 'Earlier', state: 'done' },
        { type: 'text', text: 'More', state: 'done' },
      ]),
    );
    expect(onEnd.mock.calls[0][0].responseMessage.parts).not.toContainEqual({
      type: 'text',
      text: 'Mutation',
      state: 'done',
    });
    expect(originalMessages[0].parts).toHaveLength(1);
  });

  it('preserves reasoning in model results while respecting UI filtering and metadata', async () => {
    const onStepEnd = vi.fn();
    await convertReadableStreamToArray(
      await createAgentUIStream({
        agent: new ToolLoopAgent({
          model: createModel([
            { type: 'reasoning-start', id: 'reasoning-1' },
            { type: 'reasoning-delta', id: 'reasoning-1', delta: 'Thinking' },
            { type: 'reasoning-end', id: 'reasoning-1' },
            ...textParts('Hello'),
          ]),
        }),
        uiMessages,
        generateMessageId: () => 'assistant-1',
        sendReasoning: false,
        messageMetadata: ({ part }) =>
          part.type === 'start'
            ? { label: 'test' }
            : part.type === 'finish-step'
              ? { stepComplete: true }
              : undefined,
        onStepEnd,
      }),
    );
    const event = onStepEnd.mock.calls[0][0];
    expect(event.reasoningText).toBe('Thinking');
    expect(event.reasoning).toEqual([{ type: 'reasoning', text: 'Thinking' }]);
    expect(event.responseMessage.metadata).toEqual({
      label: 'test',
      stepComplete: true,
    });
    expect(
      event.responseMessage.parts.every(
        (part: { type: string }) => part.type !== 'reasoning',
      ),
    ).toBe(true);
  });

  it('waits for the matching model result when finish-step reaches the UI first', async () => {
    const releaseModelCallback = new DelayedPromise<void>();
    const enteredModelCallback = new DelayedPromise<void>();
    const onStepEnd = vi.fn();
    const agent = new ToolLoopAgent({ model: createModel(textParts('Hello')) });
    const streamAgent = agent.stream.bind(agent);
    vi.spyOn(agent, 'stream').mockImplementation(options =>
      streamAgent({
        ...options,
        onStepEnd: async stepResult => {
          enteredModelCallback.resolve();
          await releaseModelCallback.promise;
          await options.onStepEnd?.(stepResult);
        },
      }),
    );
    const stream = await createAgentUIStream({
      agent,
      uiMessages,
      onStepEnd,
    });
    const reader = stream.getReader();
    while ((await reader.read()).value?.type !== 'text-end') {
      // Consume text chunks before the step boundary.
    }
    const next = reader.read();
    await enteredModelCallback.promise;
    expect(onStepEnd).not.toHaveBeenCalled();
    releaseModelCallback.resolve();
    expect((await next).value?.type).toBe('finish-step');
    while (!(await reader.read()).done) {
      // Consume the rest of the stream.
    }
    expect(onStepEnd).toHaveBeenCalledOnce();
    expect(onStepEnd.mock.calls[0][0].text).toBe('Hello');
    expect(onStepEnd.mock.calls[0][0].responseMessage.parts).toContainEqual({
      type: 'text',
      text: 'Hello',
      state: 'done',
    });
  });

  it('awaits asynchronous callbacks and preserves non-fatal callback errors', async () => {
    const release = new DelayedPromise<void>();
    const onEnd = vi.fn();
    const onError = vi.fn(() => 'error');
    const entered = new DelayedPromise<void>();
    const stream = await createAgentUIStream({
      agent: new ToolLoopAgent({ model: createModel(textParts('Hello')) }),
      uiMessages,
      onStepEnd: async () => {
        entered.resolve();
        await release.promise;
        throw new Error('Persistence failed');
      },
      onEnd,
      onError,
    });
    const consumed = convertReadableStreamToArray(stream);
    await entered.promise;
    expect(onEnd).not.toHaveBeenCalled();
    release.resolve();
    await consumed;
    expect(onEnd).toHaveBeenCalledOnce();
    expect(onError).not.toHaveBeenCalled();
  });

  it('supports the deprecated alias and gives onStepEnd precedence', async () => {
    const onStepFinish = vi.fn();
    const onStepEnd = vi.fn();
    for (const callbackOptions of [
      { onStepFinish },
      { onStepFinish, onStepEnd },
    ]) {
      await convertReadableStreamToArray(
        await createAgentUIStream({
          agent: new ToolLoopAgent({ model: createModel(textParts('Hello')) }),
          uiMessages,
          ...callbackOptions,
        }),
      );
    }
    expect(onStepFinish).toHaveBeenCalledOnce();
    expect(onStepEnd).toHaveBeenCalledOnce();
    expect(onStepFinish.mock.calls[0][0].responseMessage.role).toBe(
      'assistant',
    );
    expect(onStepEnd.mock.calls[0][0].responseMessage.role).toBe('assistant');
  });
});
