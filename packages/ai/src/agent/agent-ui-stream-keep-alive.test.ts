import { convertArrayToReadableStream } from '@ai-sdk/provider-utils/test';
import { describe, expect, it } from 'vitest';
import { MockLanguageModelV4 } from '../test/mock-language-model-v4';
import { createMockServerResponse } from '../test/mock-server-response';
import { createAgentUIStreamResponse } from './create-agent-ui-stream-response';
import { pipeAgentUIStreamToResponse } from './pipe-agent-ui-stream-to-response';
import { ToolLoopAgent } from './tool-loop-agent';

function createAgent() {
  return new ToolLoopAgent({
    model: new MockLanguageModelV4({
      doStream: async () => ({
        stream: convertArrayToReadableStream([
          { type: 'stream-start', warnings: [] },
          { type: 'text-start', id: '1' },
          { type: 'text-delta', id: '1', delta: 'Hello' },
          { type: 'text-end', id: '1' },
          {
            type: 'finish',
            finishReason: { unified: 'stop', raw: 'stop' },
            usage: {
              inputTokens: {
                total: 10,
                noCache: 10,
                cacheRead: undefined,
                cacheWrite: undefined,
              },
              outputTokens: { total: 10, text: 10, reasoning: undefined },
            },
          },
        ]),
      }),
    }),
  });
}

const uiMessages = [
  { role: 'user', id: 'msg-1', parts: [{ type: 'text' as const, text: 'Hi' }] },
];

describe('agent UI stream responses', () => {
  it('should forward keepAliveMs in createAgentUIStreamResponse', async () => {
    const response = await createAgentUIStreamResponse({
      agent: createAgent(),
      uiMessages,
      keepAliveMs: 25_000,
    });

    const reader = response
      .body!.pipeThrough(new TextDecoderStream())
      .getReader();

    expect(await reader.read()).toEqual({
      done: false,
      value: ': keep-alive\n\n',
    });

    await reader.cancel();
  });

  it('should forward keepAliveMs in pipeAgentUIStreamToResponse', async () => {
    const mockResponse = createMockServerResponse();

    await pipeAgentUIStreamToResponse({
      response: mockResponse,
      agent: createAgent(),
      uiMessages,
      keepAliveMs: 25_000,
    });

    expect(mockResponse.getDecodedChunks()[0]).toBe(': keep-alive\n\n');
  });
});
