import { type Context, tool } from '@ai-sdk/provider-utils';
import {
  convertArrayToReadableStream,
  convertReadableStreamToArray,
} from '@ai-sdk/provider-utils/test';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod/v4';
import { MockLanguageModelV4 } from '../test/mock-language-model-v4';
import { createAgentUIStream } from './create-agent-ui-stream';
import { ToolLoopAgent } from './tool-loop-agent';
import { createAgentUIStreamResponse } from './create-agent-ui-stream-response';
import type { UIMessage } from '../ui/ui-messages';

const currentTool = tool({
  inputSchema: z.object({ current: z.string() }),
  outputSchema: z.object({ result: z.string() }),
});

function createMockModel() {
  return new MockLanguageModelV4({
    doStream: async () => ({
      stream: convertArrayToReadableStream([
        { type: 'stream-start', warnings: [] },
        {
          type: 'response-metadata',
          id: 'id-0',
          modelId: 'mock-model-id',
          timestamp: new Date(0),
        },
        { type: 'text-start', id: '1' },
        { type: 'text-delta', id: '1', delta: 'response' },
        { type: 'text-end', id: '1' },
        {
          type: 'finish',
          finishReason: { unified: 'stop', raw: 'stop' },
          usage: {
            inputTokens: {
              total: 1,
              noCache: 1,
              cacheRead: undefined,
              cacheWrite: undefined,
            },
            outputTokens: {
              total: 1,
              text: 1,
              reasoning: undefined,
            },
          },
        },
      ]),
    }),
  });
}

describe('createAgentUIStream', () => {
  it.each(['stream', 'response'] as const)(
    'should convert custom data parts through the %s helper',
    async helper => {
      const model = createMockModel();
      const agent = new ToolLoopAgent({ model });
      type Message = UIMessage<unknown, { context: { project: string } }, {}>;
      const convertDataPart = vi.fn(
        (part: { type: 'data-context'; data: { project: string } }) => ({
          type: 'text' as const,
          text: `Project: ${part.data.project}`,
        }),
      );
      const options = {
        agent,
        uiMessages: [
          {
            id: '1',
            role: 'user',
            parts: [
              { type: 'text', text: 'What project?' },
              { type: 'data-context', data: { project: 'AI SDK' } },
            ],
          },
        ],
        convertDataPart,
      };
      if (helper === 'stream') {
        await convertReadableStreamToArray(
          await createAgentUIStream<
            never,
            {},
            Context,
            never,
            unknown,
            Message
          >(options),
        );
      } else {
        await (
          await createAgentUIStreamResponse<
            never,
            {},
            Context,
            never,
            unknown,
            Message
          >(options)
        ).text();
      }
      expect(convertDataPart).toHaveBeenCalledOnce();
      expect(model.doStreamCalls[0].prompt).toEqual([
        {
          role: 'user',
          content: [
            { type: 'text', text: 'What project?' },
            { type: 'text', text: 'Project: AI SDK' },
          ],
        },
      ]);
    },
  );

  it.each([undefined, () => undefined])(
    'should ignore data parts without a converted result (%s)',
    async convertDataPart => {
      const model = createMockModel();
      const stream = await createAgentUIStream({
        agent: new ToolLoopAgent({ model }),
        uiMessages: [
          {
            id: '1',
            role: 'user',
            parts: [
              { type: 'text', text: 'Hello' },
              { type: 'data-context', data: { project: 'AI SDK' } },
            ],
          },
        ],
        convertDataPart,
      });
      await convertReadableStreamToArray(stream);
      expect(model.doStreamCalls[0].prompt).toEqual([
        { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
      ]);
    },
  );

  it('should reject stale terminal input for a currently available tool', async () => {
    const agent = new ToolLoopAgent({
      model: createMockModel(),
      tools: { current: currentTool },
    });

    await expect(
      createAgentUIStream({
        agent,
        uiMessages: [
          {
            id: 'assistant-1',
            role: 'assistant',
            parts: [
              {
                type: 'tool-current',
                toolCallId: 'call-1',
                state: 'output-available',
                input: { previous: 'value' },
                output: { result: 'done' },
              },
            ],
          },
        ],
      }),
    ).rejects.toThrowError(
      'Type validation failed for messages[0].parts[0].input',
    );
  });

  it('should expose unavailable terminal tools as dynamic parts to callbacks', async () => {
    const agent = new ToolLoopAgent({
      model: createMockModel(),
      tools: { current: currentTool },
    });
    const onEnd = vi.fn();

    const stream = await createAgentUIStream({
      agent,
      uiMessages: [
        {
          id: 'assistant-1',
          role: 'assistant',
          parts: [
            {
              type: 'tool-removed',
              toolCallId: 'call-1',
              state: 'output-available',
              input: { previous: 'value' },
              output: { result: 'done' },
            },
          ],
        },
        {
          id: 'user-1',
          role: 'user',
          parts: [{ type: 'text', text: 'continue' }],
        },
      ],
      onEnd,
    });

    await convertReadableStreamToArray(stream);

    expect(onEnd).toHaveBeenCalledOnce();
    expect(onEnd.mock.calls[0][0].messages[0].parts[0]).toEqual({
      type: 'dynamic-tool',
      dynamic: false,
      toolName: 'removed',
      toolCallId: 'call-1',
      state: 'output-available',
      input: { previous: 'value' },
      output: { result: 'done' },
    });
  });

  it('should expose terminal tool history as dynamic parts when tools are omitted', async () => {
    const agent = new ToolLoopAgent({
      model: createMockModel(),
    });
    const onEnd = vi.fn();

    const stream = await createAgentUIStream({
      agent,
      uiMessages: [
        {
          id: 'assistant-1',
          role: 'assistant',
          parts: [
            {
              type: 'tool-removed',
              toolCallId: 'call-1',
              state: 'output-available',
              input: { previous: 'value' },
              output: { result: 'done' },
            },
          ],
        },
        {
          id: 'user-1',
          role: 'user',
          parts: [{ type: 'text', text: 'continue' }],
        },
      ],
      onEnd,
    });

    await convertReadableStreamToArray(stream);

    expect(onEnd).toHaveBeenCalledOnce();
    expect(onEnd.mock.calls[0][0].messages[0].parts[0]).toEqual({
      type: 'dynamic-tool',
      dynamic: false,
      toolName: 'removed',
      toolCallId: 'call-1',
      state: 'output-available',
      input: { previous: 'value' },
      output: { result: 'done' },
    });
  });
});
