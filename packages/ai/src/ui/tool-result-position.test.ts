import { type ToolSet } from '@ai-sdk/provider-utils';
import { convertArrayToReadableStream } from '@ai-sdk/provider-utils/test';
import { describe, expect, it } from 'vitest';
import { z } from 'zod/v4';
import type { ContentPart } from '../generate-text/content-part';
import { isStepCount } from '../generate-text/stop-condition';
import { streamText } from '../generate-text/stream-text';
import { toResponseMessages } from '../generate-text/to-response-messages';
import { MockLanguageModelV4 } from '../test/mock-language-model-v4';
import { readUIMessageStream } from '../ui-message-stream/read-ui-message-stream';
import type { UIMessageChunk } from '../ui-message-stream/ui-message-chunks';
import { consumeStream } from '../util/consume-stream';
import { convertToModelMessages } from './convert-to-model-messages';
import {
  createStreamingUIMessageState,
  processUIMessageStream,
} from './process-ui-message-stream';
import { isToolUIPart, type UIMessage } from './ui-messages';
import { validateUIMessages } from './validate-ui-messages';

async function record(chunks: UIMessageChunk[], message?: UIMessage) {
  const state = createStreamingUIMessageState({
    messageId: 'message',
    lastMessage: message,
  });
  await consumeStream({
    stream: processUIMessageStream({
      stream: convertArrayToReadableStream(chunks),
      runUpdateMessageJob: async job => {
        await job({ state, write: () => {} });
      },
      onError: error => {
        throw error;
      },
    }),
  });
  return state.message;
}

function call(id: string, dynamic = false): UIMessageChunk {
  return {
    type: 'tool-input-available',
    toolCallId: id,
    toolName: 'search',
    input: {},
    providerExecuted: true,
    dynamic,
    providerMetadata: { test: { call: id } },
  };
}

function output(id: string, error = false): UIMessageChunk {
  return error
    ? {
        type: 'tool-output-error',
        toolCallId: id,
        errorText: 'failed',
        providerMetadata: { test: { result: id } },
      }
    : {
        type: 'tool-output-available',
        toolCallId: id,
        output: id,
        providerMetadata: { test: { result: id } },
      };
}

function text(id: string): UIMessageChunk[] {
  return [
    { type: 'text-start', id },
    { type: 'text-delta', id, delta: id },
    { type: 'text-end', id },
  ];
}

function modelCall(id: string): ContentPart<ToolSet> {
  return {
    type: 'tool-call',
    toolCallId: id,
    toolName: 'search',
    input: {},
    providerExecuted: true,
    providerMetadata: { test: { call: id } },
  };
}

function modelResult(id: string, error = false): ContentPart<ToolSet> {
  return error
    ? {
        type: 'tool-error',
        toolCallId: id,
        toolName: 'search',
        input: {},
        error: 'failed',
        providerExecuted: true,
        providerMetadata: { test: { result: id } },
      }
    : {
        type: 'tool-result',
        toolCallId: id,
        toolName: 'search',
        input: {},
        output: id,
        providerExecuted: true,
        providerMetadata: { test: { result: id } },
      };
}

async function replay(message: UIMessage) {
  const persisted = JSON.parse(JSON.stringify(message));
  const validated = await validateUIMessages({ messages: [persisted] });
  return convertToModelMessages(validated);
}

describe('provider tool result positions', () => {
  it.each([false, true])(
    'replays streamText response messages with static or dynamic provider tools and a local tool (dynamic=%s)',
    async dynamic => {
      const usage = {
        inputTokens: {
          total: 1,
          noCache: 1,
          cacheRead: undefined,
          cacheWrite: undefined,
        },
        outputTokens: { total: 1, text: 1, reasoning: undefined },
      };
      const result = streamText({
        model: new MockLanguageModelV4({
          doStream: [
            {
              stream: convertArrayToReadableStream([
                {
                  type: 'tool-call',
                  toolCallId: 'a',
                  toolName: dynamic ? 'dynamicSearch' : 'search',
                  input: '{}',
                  providerExecuted: true,
                  dynamic,
                },
                {
                  type: 'tool-call',
                  toolCallId: 'b',
                  toolName: dynamic ? 'dynamicSearch' : 'search',
                  input: '{}',
                  providerExecuted: true,
                  dynamic,
                },
                {
                  type: 'tool-call',
                  toolCallId: 'local',
                  toolName: 'local',
                  input: '{}',
                },
                {
                  type: 'finish',
                  finishReason: { unified: 'tool-calls', raw: undefined },
                  usage,
                },
              ]),
            },
            {
              stream: convertArrayToReadableStream([
                { type: 'text-start', id: 'before' },
                { type: 'text-delta', id: 'before', delta: 'before' },
                { type: 'text-end', id: 'before' },
                {
                  type: 'tool-result',
                  toolCallId: 'b',
                  toolName: dynamic ? 'dynamicSearch' : 'search',
                  result: 'b',
                  providerExecuted: true,
                },
                { type: 'text-start', id: 'between' },
                { type: 'text-delta', id: 'between', delta: 'between' },
                { type: 'text-end', id: 'between' },
                {
                  type: 'tool-result',
                  toolCallId: 'a',
                  toolName: dynamic ? 'dynamicSearch' : 'search',
                  result: 'a',
                  providerExecuted: true,
                },
                {
                  type: 'finish',
                  finishReason: { unified: 'stop', raw: undefined },
                  usage,
                },
              ]),
            },
          ],
        }),
        tools: {
          local: { inputSchema: z.object({}), execute: async () => 'local' },
          search: {
            type: 'provider',
            isProviderExecuted: true,
            id: 'test.search',
            args: {},
            inputSchema: z.object({}),
            outputSchema: z.string(),
            supportsDeferredResults: true,
          },
        },
        prompt: 'Search',
        stopWhen: isStepCount(3),
      });
      let message: UIMessage | undefined;
      for await (const update of readUIMessageStream({
        stream: result.toUIMessageStream(),
      })) {
        message = update;
      }
      expect(message).toBeDefined();
      expect(
        message!.parts.filter(isToolUIPart).map(part => part.type),
      ).toEqual([
        dynamic ? 'dynamic-tool' : 'tool-search',
        dynamic ? 'dynamic-tool' : 'tool-search',
        'tool-local',
      ]);
      expect(await replay(message!)).toEqual(await result.responseMessages);
    },
  );

  it.each([
    { dynamic: false, error: false },
    { dynamic: true, error: false },
    { dynamic: false, error: true },
    { dynamic: true, error: true },
  ])(
    'preserves deferred order (dynamic=$dynamic, error=$error)',
    async ({ dynamic, error }) => {
      const message = await record([
        { type: 'start-step' },
        call('a', dynamic),
        call('b', dynamic),
        { type: 'finish-step' },
        { type: 'start-step' },
        ...text('before'),
        output('b', error),
        ...text('between'),
        output('a'),
        ...text('after'),
      ]);
      expect(
        message.parts
          .filter(isToolUIPart)
          .map(part =>
            part.state === 'output-available' || part.state === 'output-error'
              ? part.resultPosition
              : undefined,
          ),
      ).toEqual([
        { partIndex: 6, resultIndex: 0 },
        { partIndex: 5, resultIndex: 0 },
      ]);
      expect(await replay(message)).toEqual([
        ...(await toResponseMessages({
          tools: undefined,
          content: [modelCall('a'), modelCall('b')],
        })),
        ...(await toResponseMessages({
          tools: undefined,
          content: [
            { type: 'text', text: 'before' },
            modelResult('b', error),
            { type: 'text', text: 'between' },
            modelResult('a'),
            { type: 'text', text: 'after' },
          ],
        })),
      ]);
    },
  );

  it('keeps a result after its call when a sibling is still streaming input', async () => {
    const message = await record([
      { type: 'start-step' },
      { type: 'tool-input-start', toolCallId: 'x', toolName: 'search' },
      call('b'),
      output('b'),
      call('x'),
    ]);
    expect((await replay(message))[0].content).toMatchObject([
      { type: 'tool-call', toolCallId: 'x' },
      { type: 'tool-call', toolCallId: 'b' },
      { type: 'tool-result', toolCallId: 'b' },
    ]);
  });

  it('preserves result order when data parts become model content', async () => {
    const message = await record([
      { type: 'start-step' },
      call('a'),
      { type: 'start-step' },
      { type: 'data-note', data: 'DATA' },
      ...text('before'),
      output('a'),
      ...text('after'),
    ]);
    const messages = await convertToModelMessages([message], {
      convertDataPart: () => ({ type: 'text', text: 'DATA' }),
    });
    expect(messages[1].content).toMatchObject([
      { type: 'text', text: 'DATA' },
      { type: 'text', text: 'before' },
      { type: 'tool-result', toolCallId: 'a' },
      { type: 'text', text: 'after' },
    ]);
  });

  it('preserves result order when incomplete calls are ignored', async () => {
    const message = await record([
      { type: 'start-step' },
      call('a'),
      { type: 'start-step' },
      call('pending'),
      ...text('before'),
      output('a'),
      ...text('after'),
    ]);
    const messages = await convertToModelMessages([message], {
      ignoreIncompleteToolCalls: true,
    });
    expect(messages[1].content).toMatchObject([
      { type: 'text', text: 'before' },
      { type: 'tool-result', toolCallId: 'a' },
      { type: 'text', text: 'after' },
    ]);
  });

  it('preserves same-step results after intervening text and calls', async () => {
    const message = await record([
      { type: 'start-step' },
      call('a'),
      ...text('before'),
      call('b'),
      output('b'),
      output('a'),
    ]);
    expect(await replay(message)).toEqual(
      await toResponseMessages({
        tools: undefined,
        content: [
          modelCall('a'),
          { type: 'text', text: 'before' },
          modelCall('b'),
          modelResult('b'),
          modelResult('a'),
        ],
      }),
    );
  });

  it('retains result-only steps across continuation', async () => {
    let message = await record([
      { type: 'start-step' },
      call('a'),
      { type: 'finish-step' },
      { type: 'start-step' },
      ...text('waiting'),
      { type: 'finish-step' },
    ]);
    message = await record(
      [{ type: 'start-step' }, output('a'), { type: 'finish-step' }],
      JSON.parse(JSON.stringify(message)),
    );
    expect(await replay(message)).toEqual([
      ...(await toResponseMessages({
        tools: undefined,
        content: [modelCall('a')],
      })),
      ...(await toResponseMessages({
        tools: undefined,
        content: [{ type: 'text', text: 'waiting' }],
      })),
      ...(await toResponseMessages({
        tools: undefined,
        content: [modelResult('a')],
      })),
    ]);
  });

  it('anchors results across sources, local results, and preliminary outputs', async () => {
    const message = await record([
      { type: 'start-step' },
      call('a'),
      {
        type: 'tool-input-available',
        toolCallId: 'local',
        toolName: 'local',
        input: {},
      },
      { type: 'tool-output-available', toolCallId: 'local', output: 'local' },
      { type: 'source-url', sourceId: 'source', url: 'https://example.com' },
      {
        type: 'tool-output-available',
        toolCallId: 'a',
        output: 'partial',
        preliminary: true,
      },
      ...text('before'),
      output('a'),
    ]);
    expect(
      message.parts.find(part => isToolUIPart(part) && part.toolCallId === 'a'),
    ).toMatchObject({
      resultPosition: { partIndex: 5, resultIndex: 0 },
    });
    const modelMessages = await replay(message);
    expect(modelMessages.map(message => message.role)).toEqual([
      'assistant',
      'tool',
    ]);
    expect(modelMessages[0].content).toMatchObject([
      { type: 'tool-call', toolCallId: 'a' },
      { type: 'tool-call', toolCallId: 'local' },
      { type: 'text', text: 'before' },
      { type: 'tool-result', toolCallId: 'a' },
    ]);
  });

  it('leaves preliminary provider outputs out of model messages', async () => {
    const message = await record([
      { type: 'start-step' },
      call('a'),
      {
        type: 'tool-output-available',
        toolCallId: 'a',
        output: 'partial',
        preliminary: true,
      },
    ]);
    expect(message.parts[1]).not.toHaveProperty('resultPosition');
    expect(await replay(message)).toEqual(
      await toResponseMessages({
        tools: undefined,
        content: [modelCall('a')],
      }),
    );
  });

  it.each([false, true])(
    'discards deferred results from reset steps (dynamic=%s)',
    async dynamic => {
      let message = await record([
        { type: 'start-step' },
        call('a', dynamic),
        { type: 'finish-step' },
        { type: 'start-step' },
        ...text('discarded'),
        output('a'),
        { type: 'reset-step' },
      ]);
      expect(message.parts[1]).toMatchObject({ state: 'input-available' });
      expect(message.parts[1]).not.toHaveProperty('resultPosition');
      expect(await replay(message)).toEqual(
        await toResponseMessages({
          tools: undefined,
          content: [modelCall('a')],
        }),
      );
      message = await record([...text('retry'), output('a')], message);
      expect(message.parts[1]).toMatchObject({
        resultPosition: { partIndex: 4, resultIndex: 0 },
      });
      expect(await replay(message)).toEqual([
        ...(await toResponseMessages({
          tools: undefined,
          content: [modelCall('a')],
        })),
        ...(await toResponseMessages({
          tools: undefined,
          content: [{ type: 'text', text: 'retry' }, modelResult('a')],
        })),
      ]);
    },
  );

  it.each([false, true])(
    'clears positions on a later input update (dynamic=%s)',
    async dynamic => {
      const message = await record([
        { type: 'start-step' },
        call('a', dynamic),
        output('a'),
        call('a', dynamic),
      ]);
      expect(message.parts[1]).toMatchObject({ state: 'input-available' });
      expect(message.parts[1]).not.toHaveProperty('resultPosition');
    },
  );

  it('keeps arrival order at a shared boundary after clearing an earlier result', async () => {
    const message = await record([
      { type: 'start-step' },
      call('a'),
      call('b'),
      output('a'),
      output('b'),
      call('a'),
      output('a'),
    ]);
    expect((await replay(message))[0].content).toMatchObject([
      { type: 'tool-call', toolCallId: 'a' },
      { type: 'tool-call', toolCallId: 'b' },
      { type: 'tool-result', toolCallId: 'b' },
      { type: 'tool-result', toolCallId: 'a' },
    ]);
  });

  it('replays a provider approval and a result arriving in a later stream', async () => {
    const initial = await record([
      { type: 'start-step' },
      call('a'),
      {
        type: 'tool-approval-request',
        approvalId: 'approval',
        toolCallId: 'a',
      },
    ]);
    const message = await record(
      [
        {
          type: 'tool-approval-response',
          approvalId: 'approval',
          approved: true,
          providerExecuted: true,
        },
        { type: 'start-step' },
        ...text('before'),
        output('a'),
        ...text('after'),
      ],
      JSON.parse(JSON.stringify(initial)),
    );
    expect(
      (await replay(message)).map(message => message.content),
    ).toMatchObject([
      [
        { type: 'tool-call', toolCallId: 'a' },
        { type: 'tool-approval-request', approvalId: 'approval' },
      ],
      [
        {
          type: 'tool-approval-response',
          approvalId: 'approval',
          approved: true,
        },
      ],
      [
        { type: 'text', text: 'before' },
        { type: 'tool-result', toolCallId: 'a' },
        { type: 'text', text: 'after' },
      ],
    ]);
  });

  it('preserves positions when superseded approval requests are filtered out', async () => {
    const message = await record([
      { type: 'start-step' },
      call('a'),
      { type: 'start-step' },
      call('pending'),
      {
        type: 'tool-approval-request',
        approvalId: 'pending-approval',
        toolCallId: 'pending',
      },
      ...text('before'),
      output('a'),
      ...text('after'),
    ]);
    const messages = await convertToModelMessages([
      message,
      { role: 'user', parts: [{ type: 'text', text: 'next' }] },
    ]);
    expect(messages[1].content).toMatchObject([
      { type: 'text', text: 'before' },
      { type: 'tool-result', toolCallId: 'a' },
      { type: 'text', text: 'after' },
    ]);
  });

  it.each([
    'input-available',
    'approval-requested',
    'approval-responded',
  ] as const)(
    'restores %s after resetting deferred preliminary or final results',
    async state => {
      for (const preliminary of [true, false]) {
        const chunks: UIMessageChunk[] = [{ type: 'start-step' }, call('a')];
        if (state !== 'input-available')
          chunks.push({
            type: 'tool-approval-request',
            approvalId: 'approval',
            toolCallId: 'a',
          });
        if (state === 'approval-responded')
          chunks.push({
            type: 'tool-approval-response',
            approvalId: 'approval',
            approved: true,
          });
        const initial = await record(chunks);
        const expected = JSON.parse(JSON.stringify(initial.parts[1]));
        const message = await record(
          [
            { type: 'start-step' },
            {
              type: 'tool-output-available',
              toolCallId: 'a',
              output: 'attempt',
              preliminary,
            },
            { type: 'reset-step' },
          ],
          JSON.parse(JSON.stringify(initial)),
        );
        expect(message.parts[1]).toEqual(expected);
      }
    },
  );

  it('retains approval state when resetting a persisted deferred result', async () => {
    const message = await record([
      { type: 'start-step' },
      call('a'),
      {
        type: 'tool-approval-request',
        approvalId: 'approval',
        toolCallId: 'a',
      },
      {
        type: 'tool-approval-response',
        approvalId: 'approval',
        approved: true,
      },
      { type: 'start-step' },
      output('a'),
    ]);
    const reset = await record(
      [{ type: 'reset-step' }],
      JSON.parse(JSON.stringify(message)),
    );
    expect(reset.parts[1]).toMatchObject({
      state: 'approval-responded',
      approval: { id: 'approval', approved: true },
    });
    expect(reset.parts[1]).not.toHaveProperty('resultPosition');
    expect(reset.parts[1]).not.toHaveProperty('output');
  });

  it('continues messages that have no initial step boundary', async () => {
    const message = await record(
      [{ type: 'start-step' }, ...text('before'), output('a')],
      {
        id: 'message',
        role: 'assistant',
        parts: [
          {
            type: 'tool-search',
            toolCallId: 'a',
            state: 'input-available',
            input: {},
            providerExecuted: true,
            callProviderMetadata: { test: { call: 'a' } },
          },
        ],
      },
    );
    expect(message.parts[0]).toMatchObject({
      resultPosition: { partIndex: 3, resultIndex: 0 },
    });
    expect(await replay(message)).toEqual([
      ...(await toResponseMessages({
        tools: undefined,
        content: [modelCall('a')],
      })),
      ...(await toResponseMessages({
        tools: undefined,
        content: [{ type: 'text', text: 'before' }, modelResult('a')],
      })),
    ]);
  });

  it.each([
    { partIndex: -1, resultIndex: 0 },
    { partIndex: 0, resultIndex: -1 },
    { partIndex: 0.5, resultIndex: 0 },
    { partIndex: 0, resultIndex: 0.5 },
  ])('rejects invalid persisted positions: %j', async resultPosition => {
    await expect(
      validateUIMessages({
        messages: [
          {
            id: 'message',
            role: 'assistant',
            parts: [
              {
                type: 'tool-search',
                toolCallId: 'a',
                state: 'output-available',
                providerExecuted: true,
                input: {},
                output: 'a',
                resultPosition,
              },
            ],
          },
        ],
      }),
    ).rejects.toThrow();
  });

  it('keeps legacy placement when positions are absent or invalid', async () => {
    for (const resultPosition of [
      undefined,
      { partIndex: 4, resultIndex: 0 },
      { partIndex: 0, resultIndex: 0 },
      { partIndex: 1, resultIndex: 0 },
      { partIndex: 0, resultIndex: -1 },
    ]) {
      const messages = await convertToModelMessages([
        {
          role: 'assistant',
          parts: [
            { type: 'step-start' },
            {
              type: 'tool-search',
              toolCallId: 'a',
              state: 'output-available',
              providerExecuted: true,
              input: {},
              output: 'a',
              resultPosition,
            },
            { type: 'text', text: 'after' },
          ],
        },
      ]);
      expect(messages[0].content).toMatchObject([
        { type: 'tool-call', toolCallId: 'a' },
        { type: 'tool-result', toolCallId: 'a' },
        { type: 'text', text: 'after' },
      ]);
    }
  });
});
