import {
  APICallError,
  InvalidArgumentError,
  UnsupportedFunctionalityError,
  type Experimental_RealtimeModelV4 as RealtimeModelV4,
  type Experimental_RealtimeModelV4ClientEvent as RealtimeModelV4ClientEvent,
} from '@ai-sdk/provider';
import { describe, expect, it, vi } from 'vitest';
import {
  createOpenAI,
  type Experimental_OpenAIRealtimeModelLiveOptions as OpenAIRealtimeModelLiveOptions,
} from '../index';

const options = {
  delegation: {
    type: 'responses',
    responses: {
      model: 'gpt-5-mini',
      tools: [{ type: 'web_search' }],
      toolChoice: 'auto',
    },
  },
} satisfies OpenAIRealtimeModelLiveOptions;

describe('OpenAIRealtimeModelLive', () => {
  const model = createOpenAI({ apiKey: 'test-key' }).experimental_live(
    'gpt-live-1',
  );

  it('implements the existing v4 spec and declares continuous transports', () => {
    const realtime: RealtimeModelV4 = model;
    expect(realtime.specificationVersion).toBe('v4');
    expect(realtime.provider).toBe('openai.live');
    expect(realtime.modelId).toBe('gpt-live-1');
    expect(realtime.capabilities).toEqual({
      conversation: 'continuous',
      transports: ['websocket', 'webrtc'],
      connections: ['server-websocket', 'webrtc'],
      startup: 'session-start',
      finalization: 'session-close',
    });
    expect(realtime.getWebRTCConfig?.()).toEqual({
      dataChannelLabel: 'oai-events',
    });
    expect(createOpenAI().experimental_realtime('gpt-realtime').provider).toBe(
      'openai.realtime',
    );
  });

  it('returns authenticated server WS settings without model query parameters', async () => {
    const config = await model.getServerWebSocketConfig();
    expect(config.url).toBe('wss://api.openai.com/v1/live/sessions');
    expect(config.headers.authorization).toBe('Bearer test-key');
    expect(
      Object.values(config.headers).every(value => typeof value === 'string'),
    ).toBe(true);
  });

  it('preserves a custom base path, provider name, organization, project, and headers', () => {
    const custom = createOpenAI({
      apiKey: 'test-key',
      baseURL: 'https://example.com/proxy/v1/',
      name: 'custom',
      organization: 'org-test',
      project: 'proj-test',
      headers: { 'X-Custom': 'value' },
    }).experimental_live('gpt-live-1');
    expect(custom.provider).toBe('custom.live');
    expect(custom.getServerWebSocketConfig()).toEqual({
      url: 'wss://example.com/proxy/v1/live/sessions',
      headers: expect.objectContaining({
        authorization: 'Bearer test-key',
        'openai-organization': 'org-test',
        'openai-project': 'proj-test',
        'x-custom': 'value',
      }),
    });
  });

  it('maps an HTTP development base URL to ws', () => {
    expect(
      createOpenAI({ apiKey: 'test-key', baseURL: 'http://localhost:3000/v1' })
        .experimental_live('gpt-live-1')
        .getServerWebSocketConfig().url,
    ).toBe('ws://localhost:3000/v1/live/sessions');
  });

  it('builds the documented WS startup payload', () => {
    expect(
      model.serializeClientEvent({
        type: 'session-start',
        eventId: 'start-1',
        config: {
          instructions: 'Be concise.',
          voice: 'marin',
          providerOptions: { openai: options },
        },
      }),
    ).toEqual({
      type: 'session.start',
      event_id: 'start-1',
      session: {
        model: 'gpt-live-1',
        instructions: 'Be concise.',
        audio: {
          format: { type: 'audio/pcm', rate: 24000 },
          output: { voice: 'marin' },
        },
        delegation: {
          type: 'responses',
          responses: {
            model: 'gpt-5-mini',
            tools: [{ type: 'web_search' }],
            tool_choice: 'auto',
          },
        },
      },
    });
  });

  it('supports startup history, client delegation, storage, and custom voices', () => {
    const input = [
      {
        type: 'message',
        role: 'user',
        content: [{ type: 'input_text', text: 'Hello' }],
      },
      {
        type: 'message',
        role: 'assistant',
        content: [{ type: 'output_text', text: 'Hi' }],
      },
    ];
    expect(
      model.buildSessionConfig({
        providerOptions: {
          openai: {
            delegation: { type: 'client' },
            input,
            store: true,
            voice: { id: 'voice-test' },
          },
        },
      }),
    ).toEqual({
      model: 'gpt-live-1',
      audio: {
        format: { type: 'audio/pcm', rate: 24000 },
        output: { voice: { id: 'voice-test' } },
      },
      delegation: { type: 'client' },
      input,
      store: true,
    });
    expect(
      model.buildSessionConfig({
        providerOptions: { openai: { delegation: null, store: false } },
      }),
    ).toMatchObject({ delegation: null, store: false });
  });

  it('passes custom tools, named tool choice, reasoning, and verbosity to startup and updates', () => {
    const responses = {
      model: 'backend',
      tools: [
        {
          type: 'function',
          name: 'lookup',
          description: 'Look up an order.',
          parameters: {
            type: 'object',
            properties: { orderId: { type: 'string' } },
            required: ['orderId'],
            additionalProperties: false,
          },
          strict: true,
        },
        { type: 'web_search' },
      ],
      toolChoice: { type: 'function', name: 'lookup' },
      reasoning: { effort: 'low', summary: 'auto' },
      text: { verbosity: 'low' },
    } satisfies NonNullable<
      Extract<
        OpenAIRealtimeModelLiveOptions['delegation'],
        { type: 'responses' }
      >['responses']
    >;
    const config = {
      providerOptions: {
        openai: { delegation: { type: 'responses', responses } },
      },
    };
    const { toolChoice, ...unchangedResponses } = responses;
    const wireResponses = { ...unchangedResponses, tool_choice: toolChoice };
    expect(model.buildSessionConfig(config)).toMatchObject({
      delegation: { type: 'responses', responses: wireResponses },
    });
    expect(
      model.serializeClientEvent({ type: 'session-update', config }),
    ).toEqual({
      type: 'session.update',
      session: { delegation: { type: 'responses', responses: wireResponses } },
    });
  });

  it.each([
    { tools: [{ type: 'function', name: '', parameters: {} }] },
    { tools: [{ type: 'function', name: 'lookup', parameters: [] }] },
    {
      tools: [
        { type: 'function', name: 'lookup', parameters: {}, strict: 'yes' },
      ],
    },
    { toolChoice: { type: 'function', function: { name: 'lookup' } } },
    { reasoning: { effort: 'maximum' } },
    { text: { verbosity: 'verbose' } },
    { text: { format: { type: 'json_object' } } },
  ])('rejects unsupported backend settings %j', responses => {
    expect(() =>
      model.buildSessionConfig({
        providerOptions: {
          openai: {
            delegation: {
              type: 'responses',
              responses: { model: 'backend', ...responses },
            },
          },
        },
      }),
    ).toThrow();
  });

  it.each([
    { type: 'audio/pcm', rate: 16000 },
    { type: 'audio/pcm', rate: 24000 },
    { type: 'audio/pcmu', rate: 8000 },
    { type: 'audio/pcma', rate: 8000 },
  ])('supports the shared audio format %j', format => {
    expect(
      model.buildSessionConfig({
        inputAudioFormat: format,
        outputAudioFormat: format,
      }),
    ).toMatchObject({ audio: { format } });
    expect(
      model.buildSessionConfig({ outputAudioFormat: format }),
    ).toMatchObject({ audio: { format } });
  });

  it('rejects different input and output formats and ambiguous voices', () => {
    expect(() =>
      model.buildSessionConfig({
        inputAudioFormat: { type: 'audio/pcm', rate: 24000 },
        outputAudioFormat: { type: 'audio/pcm', rate: 16000 },
      }),
    ).toThrow(InvalidArgumentError);
    expect(() =>
      model.buildSessionConfig({
        voice: 'marin',
        providerOptions: { openai: { voice: { id: 'voice-test' } } },
      }),
    ).toThrow(InvalidArgumentError);
  });

  it.each([
    { inputAudioFormat: { type: 'audio/pcm', rate: 48000 } },
    { inputAudioFormat: { type: 'audio/mp3' } },
    {
      providerOptions: {
        openai: { delegation: { type: 'responses', responses: {} } },
      },
    },
    {
      providerOptions: {
        openai: {
          delegation: {
            type: 'responses',
            responses: { model: 'backend', tools: [{ type: 'unknown' }] },
          },
        },
      },
    },
    {
      providerOptions: {
        openai: {
          input: [
            {
              type: 'message',
              role: 'system',
              content: [{ type: 'input_text', text: 'Hello' }],
            },
          ],
        },
      },
    },
    { providerOptions: { openai: { store: 'yes' } } },
    { providerOptions: { openai: { unknown: true } } },
  ])('validates startup config %j', config => {
    expect(() => model.buildSessionConfig(config)).toThrow();
  });

  it('rejects unsupported voice-turn settings', () => {
    expect(() =>
      model.buildSessionConfig({ turnDetection: { type: 'disabled' } }),
    ).toThrow(UnsupportedFunctionalityError);
    expect(() => model.buildSessionConfig({ tools: [] })).toThrow(
      UnsupportedFunctionalityError,
    );
  });

  it('sends only mutable Responses settings in a session update', () => {
    expect(
      model.serializeClientEvent({
        type: 'session-update',
        eventId: 'update-1',
        config: {
          providerOptions: {
            openai: {
              delegation: {
                type: 'responses',
                responses: {
                  instructions: 'Updated backend instructions',
                  tools: [],
                  toolChoice: 'none',
                },
              },
            },
          },
        },
      }),
    ).toEqual({
      type: 'session.update',
      event_id: 'update-1',
      session: {
        delegation: {
          type: 'responses',
          responses: {
            instructions: 'Updated backend instructions',
            tools: [],
            tool_choice: 'none',
          },
        },
      },
    });
    expect(() =>
      model.serializeClientEvent({
        type: 'session-update',
        config: { instructions: 'immutable' },
      }),
    ).toThrow(UnsupportedFunctionalityError);
    expect(() =>
      model.serializeClientEvent({
        type: 'session-update',
        config: {
          providerOptions: { openai: { delegation: { type: 'client' } } },
        },
      }),
    ).toThrow();
    expect(() =>
      model.serializeClientEvent({
        type: 'session-update',
        config: { providerOptions: { openai: { delegation: null } } },
      }),
    ).toThrow();
  });

  it.each([
    [
      { type: 'session-close', eventId: 'close-1' },
      { type: 'session.close', event_id: 'close-1' },
    ],
    [
      { type: 'input-audio-append', audio: 'AAAA' },
      { type: 'session.input_audio.append', audio: 'AAAA' },
    ],
    [
      { type: 'input-audio-mute', eventId: 'mute-1' },
      { type: 'session.input_audio.mute', event_id: 'mute-1' },
    ],
    [{ type: 'input-audio-unmute' }, { type: 'session.input_audio.unmute' }],
    [
      {
        type: 'backend-tool-result',
        callId: 'call-1',
        output: '{"ok":true}',
        eventId: 'result-1',
      },
      {
        type: 'response.item.create',
        event_id: 'result-1',
        item: {
          type: 'function_call_output',
          call_id: 'call-1',
          output: '{"ok":true}',
        },
      },
    ],
    [
      { type: 'backend-response-create', eventId: 'continue-1' },
      { type: 'response.create', event_id: 'continue-1' },
    ],
    [{ type: 'backend-response-create' }, { type: 'response.create' }],
    [
      {
        type: 'backend-input-create',
        eventId: 'input-1',
        content: [
          { type: 'text', text: 'Read this order.' },
          {
            type: 'image',
            url: 'https://example.com/order.png',
            providerOptions: { openai: { imageDetail: 'high' } },
          },
          { type: 'image', url: 'data:image/png;base64,AAAA' },
        ],
      },
      {
        type: 'response.item.create',
        event_id: 'input-1',
        item: {
          type: 'message',
          role: 'user',
          content: [
            { type: 'input_text', text: 'Read this order.' },
            {
              type: 'input_image',
              image_url: 'https://example.com/order.png',
              detail: 'high',
            },
            { type: 'input_image', image_url: 'data:image/png;base64,AAAA' },
          ],
        },
      },
    ],
  ] satisfies [RealtimeModelV4ClientEvent, unknown][])(
    'serializes %j',
    (event, expected) => {
      expect(model.serializeClientEvent(event)).toEqual(expected);
    },
  );

  it.each(['instructions', 'thinking', 'commentary'] as const)(
    'serializes %s context with null or opaque delegation IDs',
    channel => {
      for (const delegationId of [null, 'opaque-delegation']) {
        expect(
          model.serializeClientEvent({
            type: 'context-append',
            providerOptions: { openai: { channel } },
            content: 'Context',
            delegationId,
            eventId: 'append-1',
          }),
        ).toEqual({
          type: `session.${channel}.append`,
          content: 'Context',
          delegation_id: delegationId,
          event_id: 'append-1',
        });
      }
    },
  );

  it.each([
    { type: 'input-audio-commit' },
    { type: 'input-audio-clear' },
    { type: 'response-create' },
    { type: 'response-cancel' },
    {
      type: 'conversation-item-truncate',
      itemId: 'item-1',
      contentIndex: 0,
      audioEndMs: 100,
    },
  ] satisfies RealtimeModelV4ClientEvent[])(
    'rejects legacy command %j',
    event => {
      expect(() => model.serializeClientEvent(event)).toThrow(
        UnsupportedFunctionalityError,
      );
    },
  );

  it('omits unsupported ephemeral and browser WebSocket capabilities', () => {
    expect(model).not.toHaveProperty('doCreateClientSecret');
    expect(model).not.toHaveProperty('getWebSocketConfig');
    expect(createOpenAI()).not.toHaveProperty('live');
  });

  describe('doCreateWebRTCSession', () => {
    const success = {
      session: { id: 'session-1' },
      transport: { type: 'webrtc', sdp: 'answer-sdp' },
    };

    it('exchanges JSON SDP, omits audio.format, and forwards headers and abort signal', async () => {
      const fetch = vi
        .fn<typeof globalThis.fetch>()
        .mockResolvedValue(Response.json(success));
      const controller = new AbortController();
      const model = createOpenAI({
        apiKey: 'test-key',
        baseURL: 'https://example.com/proxy/v1',
        organization: 'org-test',
        project: 'proj-test',
        headers: { 'X-Custom': 'value' },
        fetch,
      }).experimental_live('gpt-live-1');
      await expect(
        model.doCreateWebRTCSession({
          sdp: 'offer-sdp',
          sessionConfig: {
            instructions: 'Hello',
            providerOptions: { openai: options },
          },
          abortSignal: controller.signal,
        }),
      ).resolves.toEqual({ sessionId: 'session-1', sdp: 'answer-sdp' });
      const [url, init] = fetch.mock.calls[0];
      expect(url).toBe('https://example.com/proxy/v1/live/sessions');
      expect(init?.method).toBe('POST');
      expect(init?.signal).toBe(controller.signal);
      expect(init?.headers).toMatchObject({
        'content-type': 'application/json',
        authorization: 'Bearer test-key',
        'openai-organization': 'org-test',
        'openai-project': 'proj-test',
        'x-custom': 'value',
      });
      expect(JSON.parse(init?.body as string)).toEqual({
        session: {
          model: 'gpt-live-1',
          instructions: 'Hello',
          audio: { output: { voice: 'marin' } },
          delegation: {
            type: 'responses',
            responses: {
              model: 'gpt-5-mini',
              tools: [{ type: 'web_search' }],
              tool_choice: 'auto',
            },
          },
        },
        transport: { type: 'webrtc', sdp: 'offer-sdp' },
      });
    });

    it('accepts omitted session config', async () => {
      const fetch = vi
        .fn<typeof globalThis.fetch>()
        .mockResolvedValue(Response.json(success));
      await createOpenAI({ apiKey: 'test-key', fetch })
        .experimental_live('gpt-live-1')
        .doCreateWebRTCSession({ sdp: 'offer' });
      expect(
        JSON.parse(fetch.mock.calls[0][1]?.body as string).session,
      ).toEqual({ model: 'gpt-live-1', audio: { output: { voice: 'marin' } } });
    });

    it.each(['inputAudioFormat', 'outputAudioFormat'] as const)(
      'rejects explicit %s before fetching',
      async field => {
        const fetch = vi.fn<typeof globalThis.fetch>();
        await expect(
          createOpenAI({ apiKey: 'test-key', fetch })
            .experimental_live('gpt-live-1')
            .doCreateWebRTCSession({
              sdp: 'offer',
              sessionConfig: { [field]: { type: 'audio/pcm', rate: 24000 } },
            }),
        ).rejects.toThrow(UnsupportedFunctionalityError);
        expect(fetch).not.toHaveBeenCalled();
      },
    );

    it.each([
      {},
      { session: {}, transport: { type: 'webrtc', sdp: 'answer' } },
      {
        session: { id: 'session-1' },
        transport: { type: 'websocket', sdp: 'answer' },
      },
      { session: { id: 'session-1' }, transport: { type: 'webrtc', sdp: '' } },
    ])('rejects malformed successful response %j', async body => {
      const fetch = vi
        .fn<typeof globalThis.fetch>()
        .mockResolvedValue(Response.json(body));
      await expect(
        createOpenAI({ apiKey: 'test-key', fetch })
          .experimental_live('gpt-live-1')
          .doCreateWebRTCSession({ sdp: 'offer' }),
      ).rejects.toThrow(APICallError);
    });

    it('reports HTTP errors through the standard API error handler', async () => {
      const fetch = vi
        .fn<typeof globalThis.fetch>()
        .mockResolvedValue(
          Response.json(
            { error: { message: 'Session creation rejected', code: null } },
            { status: 400 },
          ),
        );
      await expect(
        createOpenAI({ apiKey: 'test-key', fetch })
          .experimental_live('gpt-live-1')
          .doCreateWebRTCSession({ sdp: 'offer' }),
      ).rejects.toMatchObject({
        name: 'AI_APICallError',
        statusCode: 400,
        message: 'Session creation rejected',
      });
    });

    it('preserves abort errors', async () => {
      const error = new DOMException('Aborted', 'AbortError');
      const fetch = vi.fn<typeof globalThis.fetch>().mockRejectedValue(error);
      await expect(
        createOpenAI({ apiKey: 'test-key', fetch })
          .experimental_live('gpt-live-1')
          .doCreateWebRTCSession({ sdp: 'offer' }),
      ).rejects.toBe(error);
    });
  });
});
