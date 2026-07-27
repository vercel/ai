import {
  APICallError,
  UnsupportedFunctionalityError,
  type Experimental_SharedV4Session,
  type LanguageModelV4Prompt,
} from '@ai-sdk/provider';
import {
  convertReadableStreamToArray,
  mockId,
} from '@ai-sdk/provider-utils/test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OpenAIResponsesLanguageModel } from './openai-responses-language-model';
import {
  computeResponsesInputDelta,
  createOpenAIResponsesWebSocket,
  OPENAI_RESPONSES_WEBSOCKET_SESSION_KEY,
  parseWebSocketErrorFrame,
} from './openai-responses-websocket';

const TEST_PROMPT: LanguageModelV4Prompt = [
  { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
];

const TEXT_RESPONSE_FRAMES = [
  {
    type: 'response.created',
    response: {
      id: 'resp_ws_001',
      created_at: 1741269019,
      model: 'gpt-4o-2024-07-18',
    },
  },
  {
    type: 'response.output_item.added',
    output_index: 0,
    item: {
      id: 'msg_ws_001',
      type: 'message',
      status: 'in_progress',
      role: 'assistant',
      content: [],
    },
  },
  {
    type: 'response.content_part.added',
    item_id: 'msg_ws_001',
    output_index: 0,
    content_index: 0,
    part: { type: 'output_text', text: '', annotations: [] },
  },
  {
    type: 'response.output_text.delta',
    item_id: 'msg_ws_001',
    output_index: 0,
    content_index: 0,
    delta: 'Hello,',
  },
  {
    type: 'response.output_text.delta',
    item_id: 'msg_ws_001',
    output_index: 0,
    content_index: 0,
    delta: ' World!',
  },
  {
    type: 'response.output_text.done',
    item_id: 'msg_ws_001',
    output_index: 0,
    content_index: 0,
    text: 'Hello, World!',
  },
  {
    type: 'response.content_part.done',
    item_id: 'msg_ws_001',
    output_index: 0,
    content_index: 0,
    part: {
      type: 'output_text',
      text: 'Hello, World!',
      annotations: [],
    },
  },
  {
    type: 'response.output_item.done',
    output_index: 0,
    item: {
      id: 'msg_ws_001',
      type: 'message',
      status: 'completed',
      role: 'assistant',
      content: [
        {
          type: 'output_text',
          text: 'Hello, World!',
          annotations: [],
        },
      ],
    },
  },
  {
    type: 'response.completed',
    response: {
      id: 'resp_ws_001',
      object: 'response',
      created_at: 1741269019,
      status: 'completed',
      error: null,
      incomplete_details: null,
      model: 'gpt-4o-2024-07-18',
      output: [
        {
          id: 'msg_ws_001',
          type: 'message',
          status: 'completed',
          role: 'assistant',
          content: [
            {
              type: 'output_text',
              text: 'Hello, World!',
              annotations: [],
            },
          ],
        },
      ],
      usage: {
        input_tokens: 10,
        input_tokens_details: { cached_tokens: 0 },
        output_tokens: 5,
        output_tokens_details: { reasoning_tokens: 0 },
        total_tokens: 15,
      },
    },
  },
];

class MockWebSocket {
  static instances: MockWebSocket[] = [];

  readyState = 0;
  send = vi.fn();
  close = vi.fn(() => {
    this.readyState = 3;
    this.onclose?.({});
  });
  onopen: ((event: unknown) => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  onclose: ((event: unknown) => void) | null = null;

  protocols: string | string[] | undefined;
  options: { headers?: Record<string, string | undefined> } | undefined;

  constructor(
    public url: string | URL,
    protocolsOrInit?:
      | string
      | string[]
      | { headers?: Record<string, string | undefined>; protocols?: string[] },
    options?: { headers?: Record<string, string | undefined> },
  ) {
    if (
      protocolsOrInit != null &&
      typeof protocolsOrInit === 'object' &&
      !Array.isArray(protocolsOrInit)
    ) {
      this.options = protocolsOrInit;
      this.protocols = protocolsOrInit.protocols;
    } else {
      this.protocols = protocolsOrInit;
      this.options = options;
    }
    MockWebSocket.instances.push(this);
    // Match connectToWebSocket: handlers are attached after construction.
    queueMicrotask(() => this.open());
  }

  open() {
    if (this.readyState === 1) return;
    this.readyState = 1;
    this.onopen?.({});
  }

  message(value: unknown) {
    this.onmessage?.({ data: JSON.stringify(value) });
  }

  serverClose() {
    this.readyState = 3;
    this.onclose?.({});
  }
}

const flush = () => new Promise(resolve => setTimeout(resolve, 0));

function createTestSession(): Experimental_SharedV4Session {
  type Item = {
    value: unknown;
    onDestroy?: () => void | PromiseLike<void>;
  };
  const items = new Map<string | symbol, Item>();
  let destroyed = false;

  return {
    has(key) {
      if (destroyed) throw new Error('Session has been destroyed.');
      return items.has(key);
    },
    get(key) {
      if (destroyed) throw new Error('Session has been destroyed.');
      return items.get(key)?.value as never;
    },
    set(key, value, options) {
      if (destroyed) throw new Error('Session has been destroyed.');
      if (items.has(key)) {
        throw new Error(`Session key ${String(key)} is already in use.`);
      }
      const onDestroy = options?.onDestroy;
      items.set(key, {
        value,
        onDestroy: onDestroy == null ? undefined : () => onDestroy(value),
      });
      return value;
    },
    getOrSet(key, createValue, options) {
      if (destroyed) throw new Error('Session has been destroyed.');
      const existing = items.get(key);
      if (existing !== undefined) return existing.value as never;
      return this.set(key, createValue(), options);
    },
    delete(key) {
      if (destroyed) throw new Error('Session has been destroyed.');
      const item = items.get(key);
      items.delete(key);
      return item?.value as never;
    },
    async destroy() {
      destroyed = true;
      const cleanups = Array.from(items.values(), async item => {
        await item.onDestroy?.();
      });
      items.clear();
      await Promise.all(cleanups);
    },
  };
}

function createModel(modelId = 'gpt-4o') {
  return new OpenAIResponsesLanguageModel(modelId, {
    provider: 'openai.responses',
    url: ({ path }) => `https://api.openai.com/v1${path}`,
    headers: () => ({ Authorization: 'Bearer test-api-key' }),
    generateId: mockId(),
  });
}

async function runWithFrames<T>(
  action: () => Promise<T>,
  frames: unknown[],
  options?: { instanceIndex?: number },
): Promise<{ result: T; ws: MockWebSocket }> {
  const instanceIndex = options?.instanceIndex ?? 0;
  const resultPromise = action();

  // Allow the eager connect microtask to open the socket.
  await flush();
  const ws = MockWebSocket.instances[instanceIndex];
  expect(ws).toBeDefined();

  for (const frame of frames) {
    ws.message(frame);
    await flush();
  }

  const result = await resultPromise;
  return { result, ws };
}

describe('computeResponsesInputDelta', () => {
  it('returns the full input for an empty baseline', () => {
    expect(
      computeResponsesInputDelta({
        sentItems: [],
        items: [{ role: 'user', content: 'a' }],
      }),
    ).toEqual({
      input: [{ role: 'user', content: 'a' }],
      isContinuation: false,
    });
  });

  it('returns only the tail when sent items are a prefix', () => {
    const items = [
      { role: 'user', content: 'a' },
      { type: 'function_call_output', call_id: 'call_1', output: '{}' },
    ];
    expect(
      computeResponsesInputDelta({
        sentItems: [JSON.stringify(items[0])],
        items,
      }),
    ).toEqual({
      input: [items[1]],
      isContinuation: true,
    });
  });

  it('returns empty input when items are identical', () => {
    const items = [{ role: 'user', content: 'a' }];
    expect(
      computeResponsesInputDelta({
        sentItems: [JSON.stringify(items[0])],
        items,
      }),
    ).toEqual({
      input: [],
      isContinuation: true,
    });
  });

  it('returns the full input on a prefix mismatch', () => {
    const items = [
      { role: 'user', content: 'rewritten' },
      { role: 'user', content: 'new' },
    ];
    expect(
      computeResponsesInputDelta({
        sentItems: [JSON.stringify({ role: 'user', content: 'old' })],
        items,
      }),
    ).toEqual({
      input: items,
      isContinuation: false,
    });
  });
});

describe('parseWebSocketErrorFrame', () => {
  it('recognises a WebSocket error frame with status and nested error', () => {
    expect(
      parseWebSocketErrorFrame({
        type: 'error',
        status: 400,
        error: {
          code: 'previous_response_not_found',
          message: "Previous response with id 'resp_abc' not found.",
          param: 'previous_response_id',
        },
      }),
    ).toEqual({
      code: 'previous_response_not_found',
      message: "Previous response with id 'resp_abc' not found.",
      status: 400,
      frame: expect.any(Object),
    });
  });
});

describe('OpenAI Responses WebSocket transport', () => {
  beforeEach(() => {
    MockWebSocket.instances = [];
    vi.stubGlobal('WebSocket', MockWebSocket);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('connects to wss://api.openai.com/v1/responses', async () => {
    const session = createTestSession();
    await runWithFrames(
      () =>
        createModel().doGenerate({
          prompt: TEST_PROMPT,
          experimental_session: session,
          providerOptions: { openai: { transport: 'websocket' } },
        }),
      TEXT_RESPONSE_FRAMES,
    );

    expect(MockWebSocket.instances[0].url.toString()).toBe(
      'wss://api.openai.com/v1/responses',
    );
  });

  it('sends Authorization in the second-argument init object with no subprotocol', async () => {
    const session = createTestSession();
    await runWithFrames(
      () =>
        createModel().doGenerate({
          prompt: TEST_PROMPT,
          experimental_session: session,
          providerOptions: { openai: { transport: 'websocket' } },
        }),
      TEXT_RESPONSE_FRAMES,
    );

    const ws = MockWebSocket.instances[0];
    expect(ws.protocols).toBeUndefined();
    expect(ws.options?.headers).toMatchObject({
      Authorization: 'Bearer test-api-key',
    });
  });

  it('sends response.create without stream or background', async () => {
    const session = createTestSession();
    const { ws } = await runWithFrames(
      () =>
        createModel().doGenerate({
          prompt: TEST_PROMPT,
          experimental_session: session,
          providerOptions: { openai: { transport: 'websocket' } },
        }),
      TEXT_RESPONSE_FRAMES,
    );

    expect(JSON.parse(ws.send.mock.calls[0][0])).toMatchObject({
      type: 'response.create',
      model: 'gpt-4o',
      input: [
        { role: 'user', content: [{ type: 'input_text', text: 'Hello' }] },
      ],
    });
    expect(JSON.parse(ws.send.mock.calls[0][0]).stream).toBeUndefined();
    expect(JSON.parse(ws.send.mock.calls[0][0]).background).toBeUndefined();
  });

  it('doGenerate resolves from response.completed', async () => {
    const session = createTestSession();
    const { result } = await runWithFrames(
      () =>
        createModel().doGenerate({
          prompt: TEST_PROMPT,
          experimental_session: session,
          providerOptions: { openai: { transport: 'websocket' } },
        }),
      TEXT_RESPONSE_FRAMES,
    );

    expect(result.content).toEqual([
      {
        type: 'text',
        text: 'Hello, World!',
        providerMetadata: {
          openai: { itemId: 'msg_ws_001' },
        },
      },
    ]);
    expect(result.response?.id).toBe('resp_ws_001');
    expect(result.providerMetadata?.openai).toMatchObject({
      responseId: 'resp_ws_001',
    });
  });

  it('doStream emits text parts over the websocket', async () => {
    const session = createTestSession();
    const { result } = await runWithFrames(
      () =>
        createModel().doStream({
          prompt: TEST_PROMPT,
          experimental_session: session,
          providerOptions: { openai: { transport: 'websocket' } },
        }),
      TEXT_RESPONSE_FRAMES,
    );

    const parts = await convertReadableStreamToArray(result.stream);
    expect(parts.filter(part => part.type === 'text-delta')).toEqual([
      {
        type: 'text-delta',
        id: 'msg_ws_001',
        delta: 'Hello,',
      },
      {
        type: 'text-delta',
        id: 'msg_ws_001',
        delta: ' World!',
      },
    ]);
  });

  it('reuses one socket across calls in the same session, including different model ids', async () => {
    const session = createTestSession();

    await runWithFrames(
      () =>
        createModel('gpt-4o').doGenerate({
          prompt: TEST_PROMPT,
          experimental_session: session,
          providerOptions: { openai: { transport: 'websocket' } },
        }),
      TEXT_RESPONSE_FRAMES,
    );

    const secondFrames = TEXT_RESPONSE_FRAMES.map(frame =>
      frame.type === 'response.created' || frame.type === 'response.completed'
        ? {
            ...frame,
            response: {
              ...(frame as { response: Record<string, unknown> }).response,
              id: 'resp_ws_002',
            },
          }
        : frame,
    );

    await runWithFrames(
      () =>
        createModel('gpt-4o-mini').doGenerate({
          prompt: [
            ...TEST_PROMPT,
            {
              role: 'assistant',
              content: [
                {
                  type: 'text',
                  text: 'Hello, World!',
                  providerOptions: { openai: { itemId: 'msg_ws_001' } },
                },
              ],
            },
            {
              role: 'user',
              content: [{ type: 'text', text: 'Again' }],
            },
          ],
          experimental_session: session,
          providerOptions: { openai: { transport: 'websocket' } },
        }),
      secondFrames,
      { instanceIndex: 0 },
    );

    expect(MockWebSocket.instances).toHaveLength(1);
    expect(session.has(OPENAI_RESPONSES_WEBSOCKET_SESSION_KEY)).toBe(true);
  });

  it('second turn sends previous_response_id and only new input items', async () => {
    const session = createTestSession();

    await runWithFrames(
      () =>
        createModel().doGenerate({
          prompt: [
            {
              role: 'user',
              content: [{ type: 'text', text: 'What is the weather?' }],
            },
          ],
          tools: [
            {
              type: 'function',
              name: 'weather',
              inputSchema: {
                type: 'object',
                properties: { location: { type: 'string' } },
                required: ['location'],
                additionalProperties: false,
              },
            },
          ],
          experimental_session: session,
          providerOptions: { openai: { transport: 'websocket' } },
        }),
      [
        {
          type: 'response.created',
          response: {
            id: 'resp_tool_001',
            created_at: 1741269019,
            model: 'gpt-4o',
          },
        },
        {
          type: 'response.output_item.done',
          output_index: 0,
          item: {
            id: 'fc_001',
            type: 'function_call',
            status: 'completed',
            arguments: '{"location":"SF"}',
            call_id: 'call_123',
            name: 'weather',
          },
        },
        {
          type: 'response.completed',
          response: {
            id: 'resp_tool_001',
            created_at: 1741269019,
            status: 'completed',
            error: null,
            model: 'gpt-4o',
            output: [
              {
                id: 'fc_001',
                type: 'function_call',
                status: 'completed',
                arguments: '{"location":"SF"}',
                call_id: 'call_123',
                name: 'weather',
              },
            ],
            usage: {
              input_tokens: 10,
              output_tokens: 5,
              output_tokens_details: { reasoning_tokens: 0 },
            },
          },
        },
      ],
    );

    const { ws } = await runWithFrames(
      () =>
        createModel().doGenerate({
          prompt: [
            {
              role: 'user',
              content: [{ type: 'text', text: 'What is the weather?' }],
            },
            {
              role: 'assistant',
              content: [
                {
                  type: 'tool-call',
                  toolCallId: 'call_123',
                  toolName: 'weather',
                  input: { location: 'SF' },
                  providerOptions: { openai: { itemId: 'fc_001' } },
                },
              ],
            },
            {
              role: 'tool',
              content: [
                {
                  type: 'tool-result',
                  toolCallId: 'call_123',
                  toolName: 'weather',
                  output: { type: 'json', value: { temp: 72 } },
                },
              ],
            },
          ],
          tools: [
            {
              type: 'function',
              name: 'weather',
              inputSchema: {
                type: 'object',
                properties: { location: { type: 'string' } },
                required: ['location'],
                additionalProperties: false,
              },
            },
          ],
          experimental_session: session,
          providerOptions: {
            openai: { transport: 'websocket', store: true },
          },
        }),
      TEXT_RESPONSE_FRAMES.map(frame =>
        frame.type === 'response.created' || frame.type === 'response.completed'
          ? {
              ...frame,
              response: {
                ...(frame as { response: Record<string, unknown> }).response,
                id: 'resp_tool_002',
              },
            }
          : frame,
      ),
      { instanceIndex: 0 },
    );

    const secondCreate = JSON.parse(ws.send.mock.calls.at(-1)![0]);
    expect(secondCreate.previous_response_id).toBe('resp_tool_001');
    expect(secondCreate.input).toEqual([
      {
        type: 'function_call_output',
        call_id: 'call_123',
        output: '{"temp":72}',
      },
    ]);
  });

  it('rewritten history sends full input with previous_response_id null, then resumes incremental', async () => {
    const session = createTestSession();
    const { ws } = await runWithFrames(
      () =>
        createModel().doGenerate({
          prompt: TEST_PROMPT,
          experimental_session: session,
          providerOptions: { openai: { transport: 'websocket' } },
        }),
      TEXT_RESPONSE_FRAMES,
    );

    const rewrittenFrames = TEXT_RESPONSE_FRAMES.map(frame =>
      frame.type === 'response.created' || frame.type === 'response.completed'
        ? {
            ...frame,
            response: {
              ...(frame as { response: Record<string, unknown> }).response,
              id: 'resp_ws_rewrite',
            },
          }
        : frame,
    );

    await runWithFrames(
      () =>
        createModel().doGenerate({
          prompt: [
            { role: 'user', content: [{ type: 'text', text: 'Rewritten' }] },
          ],
          experimental_session: session,
          providerOptions: { openai: { transport: 'websocket' } },
        }),
      rewrittenFrames,
      { instanceIndex: 0 },
    );

    const rewriteCreate = JSON.parse(ws.send.mock.calls[1][0]);
    expect(rewriteCreate.previous_response_id).toBeUndefined();
    expect(rewriteCreate.input).toEqual([
      {
        role: 'user',
        content: [{ type: 'input_text', text: 'Rewritten' }],
      },
    ]);

    const followUpFrames = TEXT_RESPONSE_FRAMES.map(frame =>
      frame.type === 'response.created' || frame.type === 'response.completed'
        ? {
            ...frame,
            response: {
              ...(frame as { response: Record<string, unknown> }).response,
              id: 'resp_ws_followup',
            },
          }
        : frame,
    );

    await runWithFrames(
      () =>
        createModel().doGenerate({
          prompt: [
            { role: 'user', content: [{ type: 'text', text: 'Rewritten' }] },
            {
              role: 'assistant',
              content: [
                {
                  type: 'text',
                  text: 'Hello, World!',
                  providerOptions: { openai: { itemId: 'msg_ws_001' } },
                },
              ],
            },
            { role: 'user', content: [{ type: 'text', text: 'And more' }] },
          ],
          experimental_session: session,
          providerOptions: {
            openai: { transport: 'websocket', store: true },
          },
        }),
      followUpFrames,
      { instanceIndex: 0 },
    );

    const followUpCreate = JSON.parse(ws.send.mock.calls[2][0]);
    expect(followUpCreate.previous_response_id).toBe('resp_ws_rewrite');
    expect(followUpCreate.input).toEqual([
      { type: 'item_reference', id: 'msg_ws_001' },
      {
        role: 'user',
        content: [{ type: 'input_text', text: 'And more' }],
      },
    ]);
  });

  it('throws without experimental_session', async () => {
    await expect(
      createModel().doGenerate({
        prompt: TEST_PROMPT,
        providerOptions: { openai: { transport: 'websocket' } },
      }),
    ).rejects.toBeInstanceOf(UnsupportedFunctionalityError);
  });

  it('reconnects once on previous_response_not_found before output', async () => {
    const session = createTestSession();
    const resultPromise = createModel().doGenerate({
      prompt: TEST_PROMPT,
      experimental_session: session,
      providerOptions: { openai: { transport: 'websocket' } },
    });

    await flush();
    const first = MockWebSocket.instances[0];
    first.message({
      type: 'error',
      status: 400,
      error: {
        code: 'previous_response_not_found',
        message: "Previous response with id 'resp_abc' not found.",
        param: 'previous_response_id',
      },
    });
    await flush();
    await flush();

    expect(MockWebSocket.instances).toHaveLength(2);
    const second = MockWebSocket.instances[1];
    for (const frame of TEXT_RESPONSE_FRAMES) {
      second.message(frame);
      await flush();
    }

    const result = await resultPromise;
    expect(result.response?.id).toBe('resp_ws_001');

    const retryCreate = JSON.parse(second.send.mock.calls[0][0]);
    expect(retryCreate.previous_response_id).toBeUndefined();
    expect(retryCreate.input).toEqual([
      { role: 'user', content: [{ type: 'input_text', text: 'Hello' }] },
    ]);
  });

  it('reconnects once on websocket_connection_limit_reached', async () => {
    const session = createTestSession();
    const resultPromise = createModel().doGenerate({
      prompt: TEST_PROMPT,
      experimental_session: session,
      providerOptions: { openai: { transport: 'websocket' } },
    });

    await flush();
    MockWebSocket.instances[0].message({
      type: 'error',
      status: 400,
      error: {
        code: 'websocket_connection_limit_reached',
        message:
          'Responses websocket connection limit reached (60 minutes). Create a new websocket connection to continue.',
      },
    });
    await flush();
    await flush();

    expect(MockWebSocket.instances).toHaveLength(2);
    for (const frame of TEXT_RESPONSE_FRAMES) {
      MockWebSocket.instances[1].message(frame);
      await flush();
    }

    await expect(resultPromise).resolves.toMatchObject({
      response: { id: 'resp_ws_001' },
    });
  });

  it('surfaces post-output recoverable errors without retry and resets the chain', async () => {
    const session = createTestSession();

    // First successful turn establishes a chain.
    await runWithFrames(
      () =>
        createModel().doGenerate({
          prompt: TEST_PROMPT,
          experimental_session: session,
          providerOptions: { openai: { transport: 'websocket' } },
        }),
      TEXT_RESPONSE_FRAMES,
    );

    const streamPromise = createModel().doStream({
      prompt: [
        ...TEST_PROMPT,
        {
          role: 'assistant',
          content: [
            {
              type: 'text',
              text: 'Hello, World!',
              providerOptions: { openai: { itemId: 'msg_ws_001' } },
            },
          ],
        },
        { role: 'user', content: [{ type: 'text', text: 'Next' }] },
      ],
      experimental_session: session,
      providerOptions: { openai: { transport: 'websocket', store: true } },
    });

    await flush();
    const ws = MockWebSocket.instances[0];
    const beforeSockets = MockWebSocket.instances.length;

    // Emit output, then a recoverable error.
    ws.message(TEXT_RESPONSE_FRAMES[0]); // created
    await flush();
    ws.message(TEXT_RESPONSE_FRAMES[1]); // output_item.added
    await flush();
    ws.message(TEXT_RESPONSE_FRAMES[3]); // text delta
    await flush();
    ws.message({
      type: 'error',
      status: 400,
      error: {
        code: 'previous_response_not_found',
        message: 'gone',
      },
    });
    await flush();

    const { stream } = await streamPromise;
    const parts = await convertReadableStreamToArray(stream);
    expect(parts.some(part => part.type === 'error')).toBe(true);
    expect(MockWebSocket.instances).toHaveLength(beforeSockets);

    // Next turn should send full input (chain was reset), not chain from dead id.
    await runWithFrames(
      () =>
        createModel().doGenerate({
          prompt: [
            { role: 'user', content: [{ type: 'text', text: 'Fresh' }] },
          ],
          experimental_session: session,
          providerOptions: { openai: { transport: 'websocket' } },
        }),
      TEXT_RESPONSE_FRAMES.map(frame =>
        frame.type === 'response.created' || frame.type === 'response.completed'
          ? {
              ...frame,
              response: {
                ...(frame as { response: Record<string, unknown> }).response,
                id: 'resp_after_error',
              },
            }
          : frame,
      ),
      { instanceIndex: 0 },
    );

    const nextCreate = JSON.parse(ws.send.mock.calls.at(-1)![0]);
    expect(nextCreate.previous_response_id).toBeUndefined();
    expect(nextCreate.input).toEqual([
      { role: 'user', content: [{ type: 'input_text', text: 'Fresh' }] },
    ]);
  });

  it('replaces a socket that closed while idle and sends full input', async () => {
    const session = createTestSession();
    await runWithFrames(
      () =>
        createModel().doGenerate({
          prompt: TEST_PROMPT,
          experimental_session: session,
          providerOptions: { openai: { transport: 'websocket' } },
        }),
      TEXT_RESPONSE_FRAMES,
    );

    MockWebSocket.instances[0].serverClose();
    await flush();

    await runWithFrames(
      () =>
        createModel().doGenerate({
          prompt: [
            { role: 'user', content: [{ type: 'text', text: 'Again' }] },
          ],
          experimental_session: session,
          providerOptions: { openai: { transport: 'websocket' } },
        }),
      TEXT_RESPONSE_FRAMES.map(frame =>
        frame.type === 'response.created' || frame.type === 'response.completed'
          ? {
              ...frame,
              response: {
                ...(frame as { response: Record<string, unknown> }).response,
                id: 'resp_reconnect',
              },
            }
          : frame,
      ),
      { instanceIndex: 1 },
    );

    expect(MockWebSocket.instances).toHaveLength(2);
    const create = JSON.parse(MockWebSocket.instances[1].send.mock.calls[0][0]);
    expect(create.previous_response_id).toBeUndefined();
    expect(create.input).toEqual([
      { role: 'user', content: [{ type: 'input_text', text: 'Again' }] },
    ]);
  });

  it('does not poison the session when the initial connect fails', async () => {
    const session = createTestSession();
    let attempts = 0;

    class FailingThenWorkingWebSocket extends MockWebSocket {
      constructor(
        url: string | URL,
        protocolsOrInit?: ConstructorParameters<typeof MockWebSocket>[1],
        options?: ConstructorParameters<typeof MockWebSocket>[2],
      ) {
        attempts++;
        if (attempts === 1) {
          throw new Error('connect failed');
        }
        super(url, protocolsOrInit, options);
      }
    }

    vi.stubGlobal('WebSocket', FailingThenWorkingWebSocket);

    await expect(
      createModel().doGenerate({
        prompt: TEST_PROMPT,
        experimental_session: session,
        providerOptions: { openai: { transport: 'websocket' } },
      }),
    ).rejects.toThrow(/connect failed|Failed to open/);

    MockWebSocket.instances = [];

    await runWithFrames(
      () =>
        createModel().doGenerate({
          prompt: TEST_PROMPT,
          experimental_session: session,
          providerOptions: { openai: { transport: 'websocket' } },
        }),
      TEXT_RESPONSE_FRAMES,
    );

    expect(MockWebSocket.instances).toHaveLength(1);
  });

  it('closes the socket on session.destroy', async () => {
    const session = createTestSession();
    await runWithFrames(
      () =>
        createModel().doGenerate({
          prompt: TEST_PROMPT,
          experimental_session: session,
          providerOptions: { openai: { transport: 'websocket' } },
        }),
      TEXT_RESPONSE_FRAMES,
    );

    await session.destroy();
    expect(MockWebSocket.instances[0].close).toHaveBeenCalled();
  });

  it('throws when createResponse is called while a turn is in flight', async () => {
    const connection = createOpenAIResponsesWebSocket({
      url: new URL('wss://api.openai.com/v1/responses'),
      headers: { Authorization: 'Bearer test' },
    });

    await flush();
    const first = connection.createResponse({
      args: {
        model: 'gpt-4o',
        input: [{ role: 'user', content: 'hi' }],
      },
    });
    await flush();

    await expect(
      connection.createResponse({
        args: {
          model: 'gpt-4o',
          input: [{ role: 'user', content: 'parallel' }],
        },
      }),
    ).rejects.toThrow(/in-flight/);

    // Finish the first turn so cleanup can run.
    for (const frame of TEXT_RESPONSE_FRAMES) {
      MockWebSocket.instances[0].message(frame);
      await flush();
    }
    await first;
    connection.close();
  });

  it('throws APICallError when recoverable error happens twice', async () => {
    const session = createTestSession();
    const resultPromise = createModel().doGenerate({
      prompt: TEST_PROMPT,
      experimental_session: session,
      providerOptions: { openai: { transport: 'websocket' } },
    });

    // Attach the rejection handler before driving frames so the thrown
    // APICallError is never an unhandled rejection.
    const expectation =
      expect(resultPromise).rejects.toBeInstanceOf(APICallError);

    await flush();
    const errorFrame = {
      type: 'error',
      status: 400,
      error: {
        code: 'previous_response_not_found',
        message: 'not found',
      },
    };
    MockWebSocket.instances[0].message(errorFrame);
    await flush();
    await flush();
    MockWebSocket.instances[1].message(errorFrame);
    await flush();

    await expectation;
  });
});
