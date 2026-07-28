import { APICallError, InvalidArgumentError } from '@ai-sdk/provider';
import { safeValidateTypes } from '@ai-sdk/provider-utils';
import { experimental_createSession } from 'ai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { OpenAIResponsesInput } from './openai-responses-api';
import { openaiLanguageModelResponsesOptionsSchema } from './openai-responses-language-model-options';
import {
  OpenAIResponsesWebSocketSession,
  assertOpenAIResponsesTransport,
  createOpenAIResponsesWebSocketError,
  getOpenAIResponsesWebSocketSession,
} from './openai-responses-websocket';

class MockWebSocket {
  static instances: MockWebSocket[] = [];
  static configure: ((socket: MockWebSocket) => void) | undefined;

  readyState = 0;
  bufferedAmount = 0;
  onopen: ((event: unknown) => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  onclose: ((event: unknown) => void) | null = null;
  sent: string[] = [];
  closeCalls = 0;
  sendError: unknown;

  constructor(
    readonly url: string | URL,
    readonly options?: { headers?: Record<string, string> },
  ) {
    MockWebSocket.instances.push(this);
    MockWebSocket.configure?.(this);
  }

  open() {
    this.readyState = 1;
    this.onopen?.({});
  }

  message(value: unknown) {
    this.messageData(JSON.stringify(value));
  }

  messageData(data: unknown) {
    this.onmessage?.({ data });
  }

  messageText(value: string) {
    this.messageData(value);
  }

  send(data: string) {
    if (this.sendError != null) {
      throw this.sendError;
    }
    this.sent.push(data);
  }

  close() {
    this.closeCalls++;
    this.readyState = 3;
  }

  serverClose() {
    this.readyState = 3;
    this.onclose?.({});
  }
}

const usage = {
  input_tokens: 1,
  input_tokens_details: { cached_tokens: 0 },
  output_tokens: 1,
  output_tokens_details: { reasoning_tokens: 0 },
};

function terminal(responseId: string) {
  return {
    type: 'response.completed',
    sequence_number: 1,
    response: {
      id: responseId,
      created_at: 1,
      model: 'gpt-5.6',
      output: [],
      usage,
      incomplete_details: null,
    },
  };
}

function userInput(text: string): OpenAIResponsesInput {
  return [
    {
      role: 'user',
      content: [{ type: 'input_text', text }],
    },
  ];
}

type CreateRequestOptions = {
  abortSignal?: AbortSignal;
  headers?: Record<string, string | undefined>;
  modelId?: string;
  store?: boolean;
  url?: string;
};

function startRequest(
  manager: OpenAIResponsesWebSocketSession,
  input: OpenAIResponsesInput,
  options: CreateRequestOptions = {},
) {
  return manager.request({
    url: options.url ?? 'https://api.openai.com/v1/responses',
    headers: options.headers ?? {
      Authorization: 'Bearer test',
      'OpenAI-Project': undefined,
    },
    body: {
      model: options.modelId ?? 'gpt-5.6',
      input,
      store: options.store,
      stream: true,
      stream_options: { include_usage: true },
      background: false,
    },
    abortSignal: options.abortSignal,
  });
}

async function createRequest(
  manager: OpenAIResponsesWebSocketSession,
  input: OpenAIResponsesInput,
  options: CreateRequestOptions = {},
) {
  const requestPromise = startRequest(manager, input, options);
  const socket = MockWebSocket.instances.at(-1)!;
  if (socket.readyState !== 1) {
    socket.open();
  }
  return { request: await requestPromise, socket };
}

async function completeRequest(
  request: Awaited<ReturnType<typeof startRequest>>,
  socket: MockWebSocket,
  responseId: string,
) {
  socket.message(terminal(responseId));
  await request.terminal;
}

describe('OpenAIResponsesWebSocketSession', () => {
  beforeEach(() => {
    MockWebSocket.instances = [];
    MockWebSocket.configure = undefined;
    vi.stubGlobal('WebSocket', MockWebSocket);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('uses the runtime-global constructor and sends the complete request body', async () => {
    const manager = new OpenAIResponsesWebSocketSession();
    const input = userInput('Hello');
    const { request, socket } = await createRequest(manager, input, {
      headers: {
        Authorization: 'Bearer stale',
        authorization: 'Bearer test',
        'OpenAI-Project': undefined,
      },
      store: false,
    });

    expect(socket.url.toString()).toBe('wss://api.openai.com/v1/responses');
    expect(socket.options).toEqual({
      headers: { authorization: 'Bearer test' },
    });
    expect(JSON.parse(socket.sent[0])).toEqual({
      type: 'response.create',
      model: 'gpt-5.6',
      input,
      store: false,
    });

    await completeRequest(request, socket, 'resp_1');
    expect(socket.closeCalls).toBe(0);
  });

  it('waits for send backpressure to drain', async () => {
    vi.useFakeTimers();
    MockWebSocket.configure = socket => {
      socket.bufferedAmount = 2 * 1024 * 1024;
    };

    const manager = new OpenAIResponsesWebSocketSession();
    const requestPromise = startRequest(manager, userInput('Hello'));
    const socket = MockWebSocket.instances[0];
    socket.open();

    await vi.advanceTimersByTimeAsync(0);
    expect(socket.sent).toHaveLength(1);

    let requestResolved = false;
    void requestPromise.then(() => {
      requestResolved = true;
    });
    await Promise.resolve();
    expect(requestResolved).toBe(false);

    socket.bufferedAmount = 0;
    await vi.advanceTimersByTimeAsync(20);
    const request = await requestPromise;
    await completeRequest(request, socket, 'resp_1');
  });

  it('rejects a second request while the first socket is still opening', async () => {
    const manager = new OpenAIResponsesWebSocketSession();
    const firstPromise = startRequest(manager, userInput('First'));

    await expect(startRequest(manager, userInput('Second'))).rejects.toSatisfy(
      InvalidArgumentError.isInstance,
    );
    expect(MockWebSocket.instances).toHaveLength(1);

    const socket = MockWebSocket.instances[0];
    socket.open();
    const first = await firstPromise;
    await completeRequest(first, socket, 'resp_1');
  });

  it('rejects a second request while a response is in flight', async () => {
    const manager = new OpenAIResponsesWebSocketSession();
    const first = await createRequest(manager, userInput('First'));

    await expect(startRequest(manager, userInput('Second'))).rejects.toSatisfy(
      InvalidArgumentError.isInstance,
    );
    expect(first.socket.sent).toHaveLength(1);

    await completeRequest(first.request, first.socket, 'resp_1');
  });

  it('aborts while waiting for open and can reconnect', async () => {
    const manager = new OpenAIResponsesWebSocketSession();
    const abortController = new AbortController();
    const abortReason = new Error('stop opening');
    const firstPromise = startRequest(manager, userInput('First'), {
      abortSignal: abortController.signal,
    });
    const firstSocket = MockWebSocket.instances[0];

    abortController.abort(abortReason);

    await expect(firstPromise).rejects.toBe(abortReason);
    expect(firstSocket.sent).toHaveLength(0);
    expect(firstSocket.closeCalls).toBe(1);

    const second = await createRequest(manager, userInput('Second'));
    expect(MockWebSocket.instances).toHaveLength(2);
    await completeRequest(second.request, second.socket, 'resp_2');
  });

  it('aborts after send and allows a later explicit request on a new socket', async () => {
    const manager = new OpenAIResponsesWebSocketSession();
    const abortController = new AbortController();
    const abortReason = new Error('stop response');
    const first = await createRequest(manager, userInput('First'), {
      abortSignal: abortController.signal,
    });
    const terminalExpectation = expect(first.request.terminal).rejects.toBe(
      abortReason,
    );

    abortController.abort(abortReason);

    await terminalExpectation;
    expect(first.socket.closeCalls).toBe(1);

    const second = await createRequest(manager, userInput('Second'));
    expect(MockWebSocket.instances).toHaveLength(2);
    await completeRequest(second.request, second.socket, 'resp_2');
  });

  it('cancels the event stream and allows a later explicit request', async () => {
    const manager = new OpenAIResponsesWebSocketSession();
    const first = await createRequest(manager, userInput('First'));
    const cancelReason = new Error('consumer stopped');
    const terminalExpectation = expect(first.request.terminal).rejects.toBe(
      cancelReason,
    );

    await first.request.stream.cancel(cancelReason);
    first.socket.message(terminal('resp_late'));

    await terminalExpectation;
    expect(first.socket.closeCalls).toBe(1);

    const second = await createRequest(manager, userInput('Second'));
    expect(MockWebSocket.instances).toHaveLength(2);
    await completeRequest(second.request, second.socket, 'resp_2');
  });

  it('treats a synchronous send throw as pre-send and allows reconnect', async () => {
    const sendError = new Error('send failed');
    MockWebSocket.configure = socket => {
      if (MockWebSocket.instances.length === 1) {
        socket.sendError = sendError;
      }
    };

    const manager = new OpenAIResponsesWebSocketSession();
    const firstPromise = startRequest(manager, userInput('First'));
    const firstSocket = MockWebSocket.instances[0];
    firstSocket.open();

    await expect(firstPromise).rejects.toBe(sendError);
    expect(firstSocket.sent).toHaveLength(0);
    expect(firstSocket.closeCalls).toBe(1);

    const second = await createRequest(manager, userInput('Second'));
    expect(MockWebSocket.instances).toHaveLength(2);
    await completeRequest(second.request, second.socket, 'resp_2');
  });

  it('treats a close after send as non-retryable but permits a later request', async () => {
    const manager = new OpenAIResponsesWebSocketSession();
    const first = await createRequest(manager, userInput('First'));

    first.socket.serverClose();

    await expect(first.request.terminal).rejects.toMatchObject({
      isRetryable: false,
      requestBodyValues: expect.objectContaining({
        input: userInput('First'),
      }),
    });

    const second = await createRequest(manager, userInput('Second'));
    expect(MockWebSocket.instances).toHaveLength(2);
    await completeRequest(second.request, second.socket, 'resp_2');
  });

  it('reuses one socket and sends the complete current input every time', async () => {
    const manager = new OpenAIResponsesWebSocketSession();
    const firstInput = userInput('First');
    const first = await createRequest(manager, firstInput);
    await completeRequest(first.request, first.socket, 'resp_1');

    const secondInput: OpenAIResponsesInput = [
      ...firstInput,
      {
        role: 'assistant',
        content: [{ type: 'output_text', text: 'First response' }],
      },
      ...userInput('Second'),
    ];
    const second = await createRequest(manager, secondInput);

    expect(MockWebSocket.instances).toHaveLength(1);
    expect(second.socket).toBe(first.socket);
    expect(JSON.parse(second.socket.sent[1])).toEqual({
      type: 'response.create',
      model: 'gpt-5.6',
      input: secondInput,
    });
    expect(JSON.parse(second.socket.sent[1])).not.toHaveProperty(
      'previous_response_id',
    );

    await completeRequest(second.request, second.socket, 'resp_2');
  });

  it('can use the same socket for unrelated full-input requests', async () => {
    const manager = new OpenAIResponsesWebSocketSession();
    const first = await createRequest(manager, userInput('Write a story'));
    await completeRequest(first.request, first.socket, 'resp_1');

    const secondInput = userInput('Summarize this independent supplied text');
    const second = await createRequest(manager, secondInput);

    expect(second.socket).toBe(first.socket);
    expect(JSON.parse(second.socket.sent[1]).input).toEqual(secondInput);
    await completeRequest(second.request, second.socket, 'resp_2');
  });

  it('replaces the connection when its endpoint or headers change', async () => {
    const manager = new OpenAIResponsesWebSocketSession();
    const first = await createRequest(manager, userInput('First'));
    await completeRequest(first.request, first.socket, 'resp_1');

    const second = await createRequest(manager, userInput('Second'), {
      headers: { Authorization: 'Bearer replacement' },
      url: 'https://other.openai.example/v1/responses',
    });

    expect(first.socket.closeCalls).toBe(1);
    expect(MockWebSocket.instances).toHaveLength(2);
    expect(second.socket.url.toString()).toBe(
      'wss://other.openai.example/v1/responses',
    );
    expect(second.socket.options).toEqual({
      headers: { authorization: 'Bearer replacement' },
    });
    await completeRequest(second.request, second.socket, 'resp_2');
  });

  it('normalizes header names when comparing connection identity', async () => {
    const manager = new OpenAIResponsesWebSocketSession();
    const first = await createRequest(manager, userInput('First'), {
      headers: { Authorization: 'Bearer test' },
    });
    await completeRequest(first.request, first.socket, 'resp_1');

    const second = await createRequest(manager, userInput('Second'), {
      headers: { authorization: 'Bearer test' },
    });

    expect(MockWebSocket.instances).toHaveLength(1);
    expect(second.socket).toBe(first.socket);
    await completeRequest(second.request, second.socket, 'resp_2');
  });

  it('preserves frame ordering across supported message data types', async () => {
    const manager = new OpenAIResponsesWebSocketSession();
    const { request, socket } = await createRequest(
      manager,
      userInput('Hello'),
    );
    const reader = request.stream.getReader();
    const frames = ['one', 'two', 'three', 'four'].map(delta => ({
      type: 'response.output_text.delta',
      item_id: 'msg_1',
      delta,
    }));
    const encoder = new TextEncoder();

    socket.messageData(JSON.stringify(frames[0]));
    socket.messageData(encoder.encode(JSON.stringify(frames[1])));
    socket.messageData(encoder.encode(JSON.stringify(frames[2])).buffer);
    socket.messageData(new Blob([JSON.stringify(frames[3])]));
    socket.message(terminal('resp_1'));

    const results = [];
    for (;;) {
      const result = await reader.read();
      if (result.done) {
        break;
      }
      results.push(result.value);
    }

    expect(
      results
        .slice(0, 4)
        .map(result =>
          result.success && result.value.type === 'response.output_text.delta'
            ? result.value.delta
            : undefined,
        ),
    ).toEqual(['one', 'two', 'three', 'four']);
    await request.terminal;
  });

  it('surfaces server errors as non-retryable and can reconnect later', async () => {
    const manager = new OpenAIResponsesWebSocketSession();
    const first = await createRequest(manager, userInput('Hello'));

    first.socket.message({
      type: 'error',
      status: 400,
      error: {
        type: 'invalid_request_error',
        code: 'invalid_request',
        message: 'Invalid request.',
        param: 'input',
      },
    });

    await expect(first.request.terminal).rejects.toMatchObject({
      isRetryable: false,
      statusCode: 400,
    });

    const second = await createRequest(manager, userInput('Later request'));
    expect(MockWebSocket.instances).toHaveLength(2);
    await completeRequest(second.request, second.socket, 'resp_2');
  });

  it('rejects response.failed', async () => {
    const manager = new OpenAIResponsesWebSocketSession();
    const first = await createRequest(manager, userInput('Hello'));

    first.socket.message({
      type: 'response.failed',
      sequence_number: 1,
      response: {
        error: {
          code: 'server_error',
          message: 'Response failed.',
        },
        incomplete_details: null,
        usage: null,
        service_tier: null,
      },
    });

    await expect(first.request.terminal).rejects.toMatchObject({
      message: 'Response failed.',
      isRetryable: false,
    });
  });

  it('rejects malformed JSON as a post-send transport error', async () => {
    const manager = new OpenAIResponsesWebSocketSession();
    const first = await createRequest(manager, userInput('Hello'));

    first.socket.messageText('{');

    await expect(first.request.terminal).rejects.toSatisfy(
      APICallError.isInstance,
    );
    expect(first.socket.closeCalls).toBe(1);
  });

  it('rejects a schema-invalid terminal response', async () => {
    const manager = new OpenAIResponsesWebSocketSession();
    const first = await createRequest(manager, userInput('Hello'));

    first.socket.message({
      type: 'response.completed',
      sequence_number: 1,
      response: {
        output: 'invalid',
      },
    });

    await expect(first.request.terminal).rejects.toSatisfy(
      APICallError.isInstance,
    );
    expect(first.socket.closeCalls).toBe(1);
  });

  it('closes the socket when the Session item onDestroy callback runs', async () => {
    const session = experimental_createSession();
    const manager = getOpenAIResponsesWebSocketSession(session);
    const { socket } = await createRequest(manager, userInput('Hello'));

    await session.destroy();

    expect(socket.closeCalls).toBe(1);
  });

  it('fails clearly when the runtime has no global WebSocket', async () => {
    vi.stubGlobal('WebSocket', undefined);
    const manager = new OpenAIResponsesWebSocketSession();

    await expect(
      manager.request({
        url: 'https://api.openai.com/v1/responses',
        headers: { Authorization: 'Bearer test' },
        body: {
          model: 'gpt-5.6',
          input: userInput('Hello'),
        },
      }),
    ).rejects.toSatisfy(InvalidArgumentError.isInstance);

    expect(MockWebSocket.instances).toHaveLength(0);
  });
});

describe('WebSocket helpers', () => {
  it.each(['http', 'websocket'] as const)(
    'accepts the %s transport option',
    async transport => {
      await expect(
        safeValidateTypes({
          value: { transport },
          schema: openaiLanguageModelResponsesOptionsSchema,
        }),
      ).resolves.toMatchObject({ success: true });
    },
  );

  it('rejects an unknown transport option', async () => {
    await expect(
      safeValidateTypes({
        value: { transport: 'socket.io' },
        schema: openaiLanguageModelResponsesOptionsSchema,
      }),
    ).resolves.toMatchObject({ success: false });
  });

  it('requires a Session only for WebSocket transport', () => {
    expect(() =>
      assertOpenAIResponsesTransport({
        session: undefined,
        transport: 'http',
      }),
    ).not.toThrow();
    expect(() =>
      assertOpenAIResponsesTransport({
        session: undefined,
        transport: 'websocket',
      }),
    ).toThrow(
      "OpenAI Responses transport 'websocket' requires an AI SDK session.",
    );
  });

  it('allows HTTP and WebSocket calls to share a Session', () => {
    const session = experimental_createSession();

    expect(() => {
      assertOpenAIResponsesTransport({ session, transport: 'http' });
      assertOpenAIResponsesTransport({ session, transport: 'websocket' });
      assertOpenAIResponsesTransport({ session, transport: 'http' });
    }).not.toThrow();
  });

  it('preserves nested WebSocket error details', () => {
    const frame = {
      type: 'error',
      status: 429,
      error: {
        type: 'rate_limit_error',
        code: 'websocket_connection_limit_reached',
        message: 'Connection limit reached.',
        param: 'connection',
      },
    };
    const body = { input: userInput('Full input') };
    const error = createOpenAIResponsesWebSocketError({
      frame,
      url: 'wss://api.openai.com/v1/responses',
      body,
    });

    expect(APICallError.isInstance(error)).toBe(true);
    expect(error).toMatchObject({
      message: 'Connection limit reached.',
      statusCode: 429,
      isRetryable: false,
      url: 'https://api.openai.com/v1/responses',
      requestBodyValues: body,
      responseBody: JSON.stringify(frame),
      data: frame,
    });
  });

  it('preserves flat WebSocket error details', () => {
    const frame = {
      type: 'error',
      sequence_number: 2,
      status: 400,
      code: 'invalid_request_error',
      message: 'Invalid request.',
      param: 'input',
    };
    const body = { input: userInput('Hello') };
    const error = createOpenAIResponsesWebSocketError({
      frame,
      url: 'wss://api.openai.com/v1/responses',
      body,
    });

    expect(error).toMatchObject({
      message: 'Invalid request.',
      statusCode: 400,
      isRetryable: false,
      url: 'https://api.openai.com/v1/responses',
      requestBodyValues: body,
      responseBody: JSON.stringify(frame),
      data: frame,
    });
  });
});
