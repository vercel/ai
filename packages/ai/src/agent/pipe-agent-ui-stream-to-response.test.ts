import { convertArrayToReadableStream } from '@ai-sdk/provider-utils/test';
import { describe, expect, it, vi } from 'vitest';
import { createMockServerResponse } from '../test/mock-server-response';
import { MockLanguageModelV4 } from '../test/mock-language-model-v4';
import { pipeAgentUIStreamToResponse } from './pipe-agent-ui-stream-to-response';
import { ToolLoopAgent } from './tool-loop-agent';

describe('pipeAgentUIStreamToResponse', () => {
  it('calls onUIMessageStepEnd with the accumulated response message', async () => {
    const agent = new ToolLoopAgent({
      model: new MockLanguageModelV4({
        doStream: async () => ({
          stream: convertArrayToReadableStream([
            { type: 'stream-start', warnings: [] },
            {
              type: 'response-metadata',
              id: 'response-1',
              modelId: 'mock-model-id',
              timestamp: new Date(0),
            },
            { type: 'text-start', id: 'text-1' },
            { type: 'text-delta', id: 'text-1', delta: 'Hello!' },
            { type: 'text-end', id: 'text-1' },
            {
              type: 'finish',
              finishReason: { unified: 'stop' as const, raw: 'stop' },
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
              providerMetadata: {},
            },
          ]),
        }),
      }),
    });
    const response = createMockServerResponse();
    const onUIMessageStepEnd = vi.fn();

    await pipeAgentUIStreamToResponse({
      response,
      agent,
      uiMessages: [
        {
          id: 'user-1',
          role: 'user',
          parts: [{ type: 'text', text: 'Say hello.' }],
        },
      ],
      generateMessageId: () => 'assistant-1',
      onUIMessageStepEnd,
    });
    await response.waitForEnd();

    expect(onUIMessageStepEnd).toHaveBeenCalledTimes(1);
    expect(onUIMessageStepEnd.mock.calls[0][0].responseMessage).toMatchObject({
      id: 'assistant-1',
      role: 'assistant',
      parts: [{ type: 'step-start' }, { type: 'text', text: 'Hello!' }],
    });
  });
});
