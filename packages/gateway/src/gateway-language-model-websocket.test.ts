import {
  InvalidArgumentError,
  type Experimental_SharedV4Session,
  type LanguageModelV4GenerateResult,
  type LanguageModelV4Prompt,
  type LanguageModelV4StreamPart,
} from '@ai-sdk/provider';
import { convertReadableStreamToArray } from '@ai-sdk/provider-utils/test';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  GatewayInternalServerError,
  GatewayRateLimitError,
  GatewayResponseError,
} from './errors';
import { GatewayLanguageModel } from './gateway-language-model';
import {
  GATEWAY_LANGUAGE_MODEL_ERROR_FRAME_TYPE,
  GATEWAY_LANGUAGE_MODEL_REQUEST_FRAME_TYPE,
} from './gateway-language-model-websocket';
import {
  GATEWAY_AUTH_SUBPROTOCOL_PREFIX,
  GATEWAY_LANGUAGE_MODEL_SUBPROTOCOL,
  GATEWAY_TEAM_SUBPROTOCOL_PREFIX,
} from './gateway-realtime-auth';

const TEST_PROMPT: LanguageModelV4Prompt = [
  { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
];

const GENERATE_RESULT: LanguageModelV4GenerateResult = {
  content: [{ type: 'text', text: 'Hello from Gateway' }],
  finishReason: { unified: 'stop', raw: 'stop' },
  usage: {
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
  },
  warnings: [],
};

const FINISH_PART: LanguageModelV4StreamPart = {
  type: 'finish',
  finishReason: { unified: 'stop', raw: 'stop' },
  usage: GENERATE_RESULT.usage,
};

class MockWebSocket {
  static instances: MockWebSocket[] = [];

  readyState = 0;
  bufferedAmount = 0;
  sent: unknown[] = [];
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
    MockWebSocket.instances.push(this);
  }

  send = vi.fn((data: string | Uint8Array | ArrayBuffer) => {
    this.sent.push(typeof data === 'string' ? JSON.parse(data) : data);
  });

  open() {
    this.readyState = 1;
    this.onopen?.({});
  }

  message(value: unknown) {
    this.onmessage?.({ data: JSON.stringify(value) });
  }

  disconnect() {
    this.readyState = 3;
    this.onclose?.({ code: 1006, reason: 'connection lost' });
  }
}

class TestSession implements Experimental_SharedV4Session {
  private readonly items = new Map<
    string | symbol,
    {
      value: unknown;
      onDestroy?: () => void | PromiseLike<void>;
    }
  >();

  has(key: string | symbol): boolean {
    return this.items.has(key);
  }

  get<T = unknown>(key: string | symbol): T | undefined {
    return this.items.get(key)?.value as T | undefined;
  }

  getOrSet<T>(
    key: string | symbol,
    createValue: () => T,
    options?: {
      onDestroy?: (value: T) => void | PromiseLike<void>;
    },
  ): T {
    const existing = this.items.get(key);
    if (existing != null) {
      return existing.value as T;
    }

    const value = createValue();
    this.items.set(key, {
      value,
      ...(options?.onDestroy != null && {
        onDestroy: () => options.onDestroy!(value),
      }),
    });
    return value;
  }

  delete<T = unknown>(key: string | symbol): T | undefined {
    const value = this.items.get(key)?.value as T | undefined;
    this.items.delete(key);
    return value;
  }

  async destroy(): Promise<void> {
    const items = [...this.items.values()];
    this.items.clear();
    await Promise.all(items.map(item => item.onDestroy?.()));
  }
}

function createTestModel({
  modelId = 'openai/gpt-5.6',
  fetch,
}: {
  modelId?: string;
  fetch?: typeof globalThis.fetch;
} = {}) {
  return new GatewayLanguageModel(modelId, {
    provider: 'gateway',
    baseURL: 'https://ai-gateway.test/v4/ai',
    headers: () => ({
      authorization: 'Bearer test-token',
      'ai-gateway-auth-method': 'api-key',
      'x-vercel-ai-gateway-team': 'team/test',
      'x-provider-header': 'provider-value',
    }),
    fetch,
    webSocket: MockWebSocket,
    o11yHeaders: {
      'ai-o11y-request-id': 'request-123',
    },
  });
}

async function waitForSocket(index = 0): Promise<MockWebSocket> {
  for (let attempts = 0; attempts < 10; attempts++) {
    const socket = MockWebSocket.instances[index];
    if (socket != null) return socket;
    await new Promise(resolve => setTimeout(resolve, 0));
  }
  throw new Error(`WebSocket ${index} was not constructed.`);
}

function websocketOptions(session: Experimental_SharedV4Session) {
  return {
    prompt: TEST_PROMPT,
    experimental_session: session,
    providerOptions: {
      gateway: {
        transport: 'websocket',
        caching: 'auto',
      },
      openai: {
        store: false,
      },
    },
    headers: {
      'x-call-header': 'call-value',
    },
  } as const;
}

describe('GatewayLanguageModel WebSocket transport', () => {
  beforeEach(() => {
    MockWebSocket.instances = [];
  });

  it('requires an AI SDK session', async () => {
    await expect(
      createTestModel().doGenerate({
        prompt: TEST_PROMPT,
        providerOptions: {
          gateway: { transport: 'websocket' },
        },
      }),
    ).rejects.toSatisfy(InvalidArgumentError.isInstance);

    expect(MockWebSocket.instances).toHaveLength(0);
  });

  it('uses the HTTP path by default and for explicit HTTP transport', async () => {
    const fetch = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) => {
        return new Response(JSON.stringify(GENERATE_RESULT), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      },
    );

    await createTestModel({ fetch }).doGenerate({
      prompt: TEST_PROMPT,
      providerOptions: {
        gateway: { transport: 'http' },
      },
    });

    expect(fetch).toHaveBeenCalledOnce();
    expect(MockWebSocket.instances).toHaveLength(0);
    expect(
      JSON.parse(fetch.mock.calls[0][1]?.body as string),
    ).not.toHaveProperty('providerOptions.gateway.transport');
  });

  it('sends the HTTP-equivalent request over an authenticated WebSocket', async () => {
    const session = new TestSession();
    const resultPromise = createTestModel().doGenerate(
      websocketOptions(session),
    );
    const socket = await waitForSocket();

    expect(socket.url.toString()).toBe(
      'wss://ai-gateway.test/v4/ai/language-model',
    );
    expect(socket.protocols).toEqual([
      GATEWAY_LANGUAGE_MODEL_SUBPROTOCOL,
      `${GATEWAY_AUTH_SUBPROTOCOL_PREFIX}test-token`,
      expect.stringMatching(new RegExp(`^${GATEWAY_TEAM_SUBPROTOCOL_PREFIX}`)),
    ]);
    expect(socket.options?.headers).toMatchObject({
      authorization: 'Bearer test-token',
      'x-vercel-ai-gateway-team': 'team/test',
      'x-provider-header': 'provider-value',
      'x-call-header': 'call-value',
    });

    socket.open();
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(socket.sent).toHaveLength(1);
    expect(socket.sent[0]).toMatchObject({
      type: GATEWAY_LANGUAGE_MODEL_REQUEST_FRAME_TYPE,
      body: {
        prompt: TEST_PROMPT,
        providerOptions: {
          gateway: { caching: 'auto' },
          openai: { store: false },
        },
      },
      headers: {
        'ai-gateway-auth-method': 'api-key',
        'ai-language-model-id': 'openai/gpt-5.6',
        'ai-language-model-specification-version': '4',
        'ai-language-model-streaming': 'false',
        'ai-o11y-request-id': 'request-123',
        'x-call-header': 'call-value',
        'x-provider-header': 'provider-value',
      },
    });
    expect(socket.sent[0]).not.toHaveProperty('headers.authorization');
    expect(socket.sent[0]).not.toHaveProperty(
      'headers.x-vercel-ai-gateway-team',
    );

    socket.message(GENERATE_RESULT);

    await expect(resultPromise).resolves.toMatchObject({
      content: GENERATE_RESULT.content,
      finishReason: GENERATE_RESULT.finishReason,
      usage: GENERATE_RESULT.usage,
      request: {
        body: expect.not.objectContaining({
          experimental_session: expect.anything(),
        }),
      },
      response: { body: GENERATE_RESULT },
    });
  });

  it('receives plain V4 stream parts and preserves HTTP stream behavior', async () => {
    const session = new TestSession();
    const streamResultPromise = createTestModel().doStream(
      websocketOptions(session),
    );
    const socket = await waitForSocket();
    socket.open();

    const { stream } = await streamResultPromise;
    const chunksPromise = convertReadableStreamToArray(stream);
    socket.message({
      type: 'response-metadata',
      id: 'response-1',
      modelId: 'openai/gpt-5.6',
      timestamp: '2026-07-30T12:00:00.000Z',
    });
    socket.message({ type: 'raw', rawValue: { ignored: true } });
    socket.message({ type: 'text-start', id: 'text-1' });
    socket.message({ type: 'text-delta', id: 'text-1', delta: 'Hello' });
    socket.message({ type: 'text-end', id: 'text-1' });
    socket.message(FINISH_PART);

    await expect(chunksPromise).resolves.toEqual([
      {
        type: 'response-metadata',
        id: 'response-1',
        modelId: 'openai/gpt-5.6',
        timestamp: new Date('2026-07-30T12:00:00.000Z'),
      },
      { type: 'text-start', id: 'text-1' },
      { type: 'text-delta', id: 'text-1', delta: 'Hello' },
      { type: 'text-end', id: 'text-1' },
      FINISH_PART,
    ]);
  });

  it('reuses one socket for sequential model calls in the same session', async () => {
    const session = new TestSession();
    const firstPromise = createTestModel({
      modelId: 'openai/gpt-5.6',
    }).doGenerate(websocketOptions(session));
    const socket = await waitForSocket();
    socket.open();
    await new Promise(resolve => setTimeout(resolve, 0));
    socket.message(GENERATE_RESULT);
    await firstPromise;

    const secondPromise = createTestModel({
      modelId: 'anthropic/claude-sonnet-4.5',
    }).doGenerate(websocketOptions(session));
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(MockWebSocket.instances).toHaveLength(1);
    expect(socket.sent).toHaveLength(2);
    expect(socket.sent[1]).toMatchObject({
      headers: {
        'ai-language-model-id': 'anthropic/claude-sonnet-4.5',
        'ai-language-model-streaming': 'false',
      },
    });

    socket.message(GENERATE_RESULT);
    await secondPromise;
  });

  it('rejects a second in-flight request before sending it', async () => {
    const session = new TestSession();
    const firstPromise = createTestModel().doGenerate(
      websocketOptions(session),
    );
    const socket = await waitForSocket();
    socket.open();
    await new Promise(resolve => setTimeout(resolve, 0));

    await expect(
      createTestModel().doGenerate(websocketOptions(session)),
    ).rejects.toSatisfy(InvalidArgumentError.isInstance);
    expect(socket.sent).toHaveLength(1);

    socket.message(GENERATE_RESULT);
    await firstPromise;
  });

  it('maps protocol error frames to Gateway errors', async () => {
    const session = new TestSession();
    const resultPromise = createTestModel().doGenerate(
      websocketOptions(session),
    );
    const socket = await waitForSocket();
    socket.open();
    await new Promise(resolve => setTimeout(resolve, 0));

    socket.message({
      type: GATEWAY_LANGUAGE_MODEL_ERROR_FRAME_TYPE,
      statusCode: 429,
      body: {
        error: {
          message: 'Rate limit exceeded',
          type: 'rate_limit_exceeded',
        },
      },
    });

    await expect(resultPromise).rejects.toSatisfy(
      GatewayRateLimitError.isInstance,
    );
  });

  it('preserves a protocol error frame retryability override', async () => {
    const session = new TestSession();
    const resultPromise = createTestModel().doGenerate(
      websocketOptions(session),
    );
    const socket = await waitForSocket();
    socket.open();
    await new Promise(resolve => setTimeout(resolve, 0));

    socket.message({
      type: GATEWAY_LANGUAGE_MODEL_ERROR_FRAME_TYPE,
      statusCode: 500,
      isRetryable: false,
      body: {
        error: {
          message: 'Upstream request may already have been accepted',
          type: 'internal_server_error',
        },
      },
    });

    const error = await resultPromise.catch(error => error);
    expect(GatewayInternalServerError.isInstance(error)).toBe(true);
    expect(error).toMatchObject({ isRetryable: false });
  });

  it('makes a disconnect after send non-retryable', async () => {
    const session = new TestSession();
    const resultPromise = createTestModel().doGenerate(
      websocketOptions(session),
    );
    const socket = await waitForSocket();
    socket.open();
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(socket.sent).toHaveLength(1);
    socket.disconnect();

    const error = await resultPromise.catch(error => error);
    expect(GatewayResponseError.isInstance(error)).toBe(true);
    expect(error).toMatchObject({ isRetryable: false });
  });

  it('closes the persisted socket when the session is destroyed', async () => {
    const session = new TestSession();
    const resultPromise = createTestModel().doGenerate(
      websocketOptions(session),
    );
    const socket = await waitForSocket();
    socket.open();
    await new Promise(resolve => setTimeout(resolve, 0));
    socket.message(GENERATE_RESULT);
    await resultPromise;

    expect(socket.close).not.toHaveBeenCalled();
    await session.destroy();
    expect(socket.close).toHaveBeenCalledOnce();
  });
});
