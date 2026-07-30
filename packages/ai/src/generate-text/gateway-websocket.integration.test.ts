import {
  createGateway,
  GatewayInternalServerError,
  GatewayResponseError,
} from '@ai-sdk/gateway';
import type {
  LanguageModelV4GenerateResult,
  LanguageModelV4StreamPart,
} from '@ai-sdk/provider';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod/v4';
import { generateText, isStepCount, streamText, tool } from '../index';

const usage = {
  inputTokens: {
    total: 1,
    noCache: 1,
    cacheRead: 0,
    cacheWrite: 0,
  },
  outputTokens: {
    total: 2,
    text: 2,
    reasoning: 0,
  },
};

function generateResult(
  content: LanguageModelV4GenerateResult['content'],
  finishReason: LanguageModelV4GenerateResult['finishReason'] = {
    unified: 'stop',
    raw: 'stop',
  },
): LanguageModelV4GenerateResult {
  return {
    content,
    finishReason,
    usage,
    warnings: [],
  };
}

class MockGatewayWebSocket {
  static instances: MockGatewayWebSocket[] = [];
  static respond: (
    request: Record<string, unknown>,
    socket: MockGatewayWebSocket,
  ) => void = () => {};

  readyState = 0;
  bufferedAmount = 0;
  sent: Array<Record<string, unknown>> = [];
  close = vi.fn(() => {
    this.readyState = 3;
  });
  onopen: ((event: unknown) => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  onclose: ((event: unknown) => void) | null = null;

  constructor(
    readonly url: string | URL,
    readonly protocols?: string | string[],
    readonly options?: {
      headers?: Record<string, string | undefined>;
    },
  ) {
    MockGatewayWebSocket.instances.push(this);
    queueMicrotask(() => {
      this.readyState = 1;
      this.onopen?.({});
    });
  }

  send(data: string | Uint8Array | ArrayBuffer) {
    const request = JSON.parse(String(data)) as Record<string, unknown>;
    this.sent.push(request);
    queueMicrotask(() => MockGatewayWebSocket.respond(request, this));
  }

  emit(value: unknown) {
    this.onmessage?.({ data: JSON.stringify(value) });
  }

  disconnect() {
    this.readyState = 3;
    this.onclose?.({ code: 1006, reason: 'connection lost' });
  }
}

function createTestGateway() {
  return createGateway({
    apiKey: 'test-key',
    baseURL: 'https://ai-gateway.test/v4/ai',
    webSocket: MockGatewayWebSocket,
  });
}

const providerOptions = {
  openai: { transport: 'websocket' },
} as const;

describe('Gateway WebSocket public lifecycle', () => {
  beforeEach(() => {
    MockGatewayWebSocket.instances = [];
    MockGatewayWebSocket.respond = () => {};
  });

  it('reuses one socket across generateText tool steps and closes it afterward', async () => {
    MockGatewayWebSocket.respond = (_request, socket) => {
      socket.emit(
        socket.sent.length === 1
          ? generateResult(
              [
                {
                  type: 'tool-call',
                  toolCallId: 'call_1',
                  toolName: 'weather',
                  input: '{"city":"San Francisco"}',
                },
              ],
              { unified: 'tool-calls', raw: 'tool-calls' },
            )
          : generateResult([{ type: 'text', text: 'It is 72°F.' }]),
      );
    };

    const result = await generateText({
      model: createTestGateway()('openai/gpt-5.6'),
      prompt: 'What is the weather in San Francisco?',
      tools: {
        weather: tool({
          inputSchema: z.object({ city: z.string() }),
          execute: async () => ({ temperature: 72 }),
        }),
      },
      stopWhen: isStepCount(2),
      maxRetries: 0,
      providerOptions,
    });

    expect(result.text).toBe('It is 72°F.');
    expect(MockGatewayWebSocket.instances).toHaveLength(1);

    const socket = MockGatewayWebSocket.instances[0];
    expect(socket.sent).toHaveLength(2);
    expect(socket.sent[1]).toMatchObject({
      body: {
        providerOptions: {
          openai: { transport: 'websocket' },
        },
      },
    });
    expect(socket.close).toHaveBeenCalledOnce();
  });

  it('streams through streamText and closes the socket afterward', async () => {
    MockGatewayWebSocket.respond = (_request, socket) => {
      const parts: LanguageModelV4StreamPart[] = [
        { type: 'text-start', id: 'text-1' },
        { type: 'text-delta', id: 'text-1', delta: 'Hello' },
        { type: 'text-end', id: 'text-1' },
        {
          type: 'finish',
          finishReason: { unified: 'stop', raw: 'stop' },
          usage,
        },
      ];
      for (const part of parts) {
        socket.emit(part);
      }
    };

    const result = streamText({
      model: createTestGateway()('openai/gpt-5.6'),
      prompt: 'Say hello.',
      maxRetries: 0,
      providerOptions,
    });

    await expect(result.text).resolves.toBe('Hello');
    expect(MockGatewayWebSocket.instances).toHaveLength(1);
    await vi.waitFor(() => {
      expect(MockGatewayWebSocket.instances[0].close).toHaveBeenCalledOnce();
    });
  });

  it('does not retry a server error marked non-retryable', async () => {
    MockGatewayWebSocket.respond = (_request, socket) => {
      socket.emit({
        type: 'language-model.error',
        statusCode: 500,
        isRetryable: false,
        body: {
          error: {
            message: 'Upstream request may already have been accepted',
            type: 'internal_server_error',
          },
        },
      });
    };

    const error = await generateText({
      model: createTestGateway()('openai/gpt-5.6'),
      prompt: 'Hello.',
      maxRetries: 1,
      providerOptions,
    }).catch(error => error);

    expect(GatewayInternalServerError.isInstance(error)).toBe(true);
    expect(error).toMatchObject({ isRetryable: false });
    expect(MockGatewayWebSocket.instances).toHaveLength(1);
    expect(MockGatewayWebSocket.instances[0].sent).toHaveLength(1);
  });

  it('does not retry a disconnect after the request was sent', async () => {
    MockGatewayWebSocket.respond = (_request, socket) => {
      socket.disconnect();
    };

    const error = await generateText({
      model: createTestGateway()('openai/gpt-5.6'),
      prompt: 'Hello.',
      maxRetries: 1,
      providerOptions,
    }).catch(error => error);

    expect(GatewayResponseError.isInstance(error)).toBe(true);
    expect(error).toMatchObject({ isRetryable: false });
    expect(MockGatewayWebSocket.instances).toHaveLength(1);
    expect(MockGatewayWebSocket.instances[0].sent).toHaveLength(1);
  });
});
