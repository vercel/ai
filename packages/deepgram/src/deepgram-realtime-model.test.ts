import type { Experimental_RealtimeModelV4ServerEvent as RealtimeModelV4ServerEvent } from '@ai-sdk/provider';
import { describe, expect, it, vi } from 'vitest';
import { createDeepgram } from './deepgram-provider';
import { DeepgramRealtimeModel } from './deepgram-realtime-model';

const createModel = ({
  modelId = 'voice-agent',
  fetch = vi.fn(),
}: { modelId?: string; fetch?: typeof globalThis.fetch } = {}) =>
  new DeepgramRealtimeModel(modelId, {
    provider: 'deepgram.realtime',
    baseURL: 'https://api.deepgram.com',
    webSocketURL: 'wss://agent.deepgram.com/v1/agent/converse',
    headers: () => ({ authorization: 'Token test-key' }),
    fetch,
    _internal: {
      currentDate: () => new Date('2026-07-08T12:00:00.000Z'),
    },
  });

const eventTypes = (
  events: RealtimeModelV4ServerEvent | RealtimeModelV4ServerEvent[],
) => (Array.isArray(events) ? events : [events]).map(event => event.type);

describe('DeepgramRealtimeModel', () => {
  describe('model ID', () => {
    it('accepts the voice-agent model ID', () => {
      expect(createModel().modelId).toBe('voice-agent');
    });

    it.each(['open_ai/gpt-4o-mini', 'flux-general-en', ''])(
      'rejects the model ID "%s"',
      modelId => {
        expect(() => createModel({ modelId })).toThrow(
          `Unsupported Deepgram realtime model ID "${modelId}". The supported model ID is "voice-agent".`,
        );
      },
    );
  });

  describe('provider', () => {
    it('creates realtime models from experimental_realtime', () => {
      const model = createDeepgram({
        apiKey: 'test-key',
      }).experimental_realtime('voice-agent');

      expect(model).toBeInstanceOf(DeepgramRealtimeModel);
      expect(model.provider).toBe('deepgram.realtime');
      expect(model.modelId).toBe('voice-agent');
    });

    it('grants tokens with the provider API key', async () => {
      const mockFetch = vi
        .fn()
        .mockResolvedValue(
          new Response(
            JSON.stringify({ access_token: 'temporary-token', expires_in: 30 }),
            { status: 200 },
          ),
        );
      const provider = createDeepgram({ apiKey: 'test-key', fetch: mockFetch });

      const result = await provider.experimental_realtime.getToken({
        model: 'voice-agent',
      });

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.deepgram.com/v1/auth/grant',
        expect.objectContaining({
          headers: expect.objectContaining({
            authorization: 'Token test-key',
          }),
        }),
      );
      expect(result).toMatchObject({
        token: 'temporary-token',
        url: 'wss://agent.deepgram.com/v1/agent/converse',
      });
      expect(result.expiresAt).toBeTypeOf('number');
    });

    it('rejects tokens for unsupported model IDs', async () => {
      const mockFetch = vi.fn();
      const provider = createDeepgram({ apiKey: 'test-key', fetch: mockFetch });

      await expect(
        provider.experimental_realtime.getToken({ model: 'gpt-4o-mini' }),
      ).rejects.toThrow('The supported model ID is "voice-agent".');
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  it('advertises server-owned connections only', () => {
    expect(createModel().capabilities).toEqual({
      conversation: 'turn-based',
      transports: ['websocket'],
      connections: ['server-websocket'],
    });
  });

  describe('doCreateClientSecret', () => {
    it('grants a short-lived token for the agent WebSocket', async () => {
      const mockFetch = vi
        .fn()
        .mockResolvedValue(
          new Response(
            JSON.stringify({ access_token: 'temporary-token', expires_in: 60 }),
            { status: 200 },
          ),
        );
      const model = createModel({ fetch: mockFetch });

      const result = await model.doCreateClientSecret({
        expiresAfterSeconds: 60,
      });

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.deepgram.com/v1/auth/grant',
        {
          method: 'POST',
          headers: {
            authorization: 'Token test-key',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ ttl_seconds: 60 }),
        },
      );
      expect(result).toEqual({
        token: 'temporary-token',
        url: 'wss://agent.deepgram.com/v1/agent/converse',
        expiresAt: 1783512060,
      });
    });

    it('lets Deepgram choose the lifetime when none is requested', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ access_token: 'temporary-token' }), {
          status: 200,
        }),
      );
      const model = createModel({ fetch: mockFetch });

      const result = await model.doCreateClientSecret({});

      expect(mockFetch.mock.calls[0][1].body).toBe('{}');
      expect(result).toEqual({
        token: 'temporary-token',
        url: 'wss://agent.deepgram.com/v1/agent/converse',
      });
    });

    it('rejects token lifetimes Deepgram does not support', async () => {
      const mockFetch = vi.fn();
      const model = createModel({ fetch: mockFetch });

      await expect(
        model.doCreateClientSecret({ expiresAfterSeconds: 3601 }),
      ).rejects.toThrow('between 1 and 3600 seconds');
      await expect(
        model.doCreateClientSecret({ expiresAfterSeconds: 0 }),
      ).rejects.toThrow('between 1 and 3600 seconds');
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('reports a failed grant request', async () => {
      const model = createModel({
        fetch: vi.fn().mockResolvedValue(
          new Response(
            JSON.stringify({
              err_code: 'FORBIDDEN',
              err_msg: 'Insufficient permissions.',
            }),
            { status: 403 },
          ),
        ),
      });

      await expect(model.doCreateClientSecret({})).rejects.toThrow(
        'Deepgram realtime client secret request failed: 403',
      );
    });

    it('rejects a grant response without a token', async () => {
      const model = createModel({
        fetch: vi
          .fn()
          .mockResolvedValue(new Response(JSON.stringify({}), { status: 200 })),
      });

      await expect(model.doCreateClientSecret({})).rejects.toThrow();
    });
  });

  describe('WebSocket configuration', () => {
    it('authenticates browser connections with a bearer subprotocol', () => {
      const model = createModel();

      expect(
        model.getWebSocketConfig({
          token: 'temporary-token',
          url: 'wss://agent.deepgram.com/v1/agent/converse',
        }),
      ).toEqual({
        url: 'wss://agent.deepgram.com/v1/agent/converse',
        protocols: ['bearer', 'temporary-token'],
      });
    });

    it('authenticates server connections with the API key', async () => {
      const model = createModel();

      expect(await model.getServerWebSocketConfig()).toEqual({
        url: 'wss://agent.deepgram.com/v1/agent/converse',
        headers: { authorization: 'Token test-key' },
        protocols: ['token', 'test-key'],
      });
    });

    it('rejects the transcription intent', () => {
      const model = createModel();

      expect(() =>
        model.getServerWebSocketConfig({ intent: 'transcription' }),
      ).toThrow("does not support the 'transcription' session intent");
    });
  });

  describe('buildSessionConfig', () => {
    it('defaults to Flux listening, the default voice and LLM, and 24 kHz PCM', async () => {
      const model = createModel();

      expect(await model.buildSessionConfig({})).toEqual({
        type: 'Settings',
        audio: {
          input: { encoding: 'linear16', sample_rate: 24000 },
          output: {
            encoding: 'linear16',
            sample_rate: 24000,
            container: 'none',
          },
        },
        agent: {
          listen: {
            provider: {
              type: 'deepgram',
              version: 'v2',
              model: 'flux-general-en',
            },
          },
          think: { provider: { type: 'open_ai', model: 'gpt-4o-mini' } },
        },
      });
    });

    it('maps the normalized session config onto Settings', async () => {
      const model = createModel();

      expect(
        await model.buildSessionConfig({
          instructions: 'You are a terse assistant.',
          voice: 'flux-alexis-en',
          outputModalities: ['audio', 'text'],
          inputAudioFormat: { type: 'audio/pcm', rate: 16000 },
          outputAudioFormat: { type: 'audio/pcmu' },
          turnDetection: { type: 'server-vad', silenceDurationMs: 300 },
          tools: [
            {
              type: 'function',
              name: 'get_weather',
              description: 'Get the weather for a city',
              parameters: {
                type: 'object',
                properties: { city: { type: 'string' } },
                required: ['city'],
              },
            },
          ],
          providerOptions: {
            deepgram: { greeting: 'Hello!', eotThreshold: 0.8 },
          },
        }),
      ).toEqual({
        type: 'Settings',
        audio: {
          input: { encoding: 'linear16', sample_rate: 16000 },
          output: { encoding: 'mulaw', sample_rate: 8000, container: 'none' },
        },
        agent: {
          listen: {
            provider: {
              type: 'deepgram',
              version: 'v2',
              model: 'flux-general-en',
              eot_threshold: 0.8,
              eot_timeout_ms: 500,
            },
          },
          think: {
            provider: { type: 'open_ai', model: 'gpt-4o-mini' },
            prompt: 'You are a terse assistant.',
            functions: [
              {
                name: 'get_weather',
                description: 'Get the weather for a city',
                parameters: {
                  type: 'object',
                  properties: { city: { type: 'string' } },
                  required: ['city'],
                },
              },
            ],
          },
          speak: {
            provider: {
              type: 'deepgram',
              version: 'v2',
              model: 'flux-alexis-en',
            },
          },
          greeting: 'Hello!',
        },
      });
    });

    it('thinks with the LLM from the think option', async () => {
      const model = createModel();

      expect(
        await model.buildSessionConfig({
          instructions: 'Be terse.',
          providerOptions: {
            deepgram: {
              think: { provider: 'groq', model: 'openai/gpt-oss-20b' },
            },
          },
        }),
      ).toMatchObject({
        agent: {
          think: {
            provider: { type: 'groq', model: 'openai/gpt-oss-20b' },
            prompt: 'Be terse.',
          },
        },
      });
    });

    it('selects Aura voices without the Flux version', async () => {
      const model = createModel();

      expect(
        await model.buildSessionConfig({ voice: 'aura-2-thalia-en' }),
      ).toMatchObject({
        agent: {
          speak: { provider: { type: 'deepgram', model: 'aura-2-thalia-en' } },
        },
      });
    });

    it.each([null, { type: 'disabled' as const }])(
      'suppresses end-of-turn detection for turnDetection %j',
      async turnDetection => {
        const model = createModel();

        expect(await model.buildSessionConfig({ turnDetection })).toMatchObject(
          {
            agent: {
              listen: {
                provider: { eot_threshold: 1, eot_timeout_ms: 60000 },
              },
            },
          },
        );
      },
    );

    it('passes the transcription language as a hint to multilingual Flux', async () => {
      const model = createModel();

      expect(
        await model.buildSessionConfig({
          inputAudioTranscription: {
            model: 'flux-general-multi',
            language: 'es',
          },
        }),
      ).toMatchObject({
        agent: {
          listen: {
            provider: {
              type: 'deepgram',
              version: 'v2',
              model: 'flux-general-multi',
              language_hints: ['es'],
            },
          },
        },
      });
    });

    it('configures non-Flux listen models without Flux settings', async () => {
      const model = createModel();
      const settings = (await model.buildSessionConfig({
        inputAudioTranscription: { model: 'nova-3', language: 'en' },
      })) as { agent: { listen: unknown } };

      expect(settings.agent.listen).toEqual({
        provider: { type: 'deepgram', model: 'nova-3', language: 'en' },
      });
    });

    it('rejects settings the agent cannot honor', async () => {
      const model = createModel();

      await expect(
        model.buildSessionConfig({
          inputAudioTranscription: { model: 'nova-3' },
          turnDetection: null,
        }),
      ).rejects.toThrow('non-Flux listen model nova-3');
      await expect(
        model.buildSessionConfig({ outputModalities: ['text'] }),
      ).rejects.toThrow('outputModalities without audio');
      await expect(
        model.buildSessionConfig({ inputAudioFormat: { type: 'audio/opus' } }),
      ).rejects.toThrow('Unsupported Deepgram realtime audio format');
      await expect(
        model.buildSessionConfig({
          providerOptions: { deepgram: { eotThreshold: 0.2 } },
        }),
      ).rejects.toThrow('invalid deepgram provider options');
      await expect(
        model.buildSessionConfig({
          providerOptions: { deepgram: { think: { provider: 'open_ai' } } },
        }),
      ).rejects.toThrow('invalid deepgram provider options');
    });
  });

  describe('serializeClientEvent', () => {
    it('sends Settings for the first session update only', async () => {
      const model = createModel();

      expect(
        await model.serializeClientEvent({
          type: 'session-update',
          config: { instructions: 'Be terse.' },
        }),
      ).toMatchObject({
        type: 'Settings',
        agent: { think: { prompt: 'Be terse.' } },
      });
      expect(
        await model.serializeClientEvent({
          type: 'session-update',
          config: { voice: 'flux-alexis-en' },
        }),
      ).toEqual({
        type: 'UpdateSpeak',
        speak: {
          provider: {
            type: 'deepgram',
            version: 'v2',
            model: 'flux-alexis-en',
          },
        },
      });
      expect(
        await model.serializeClientEvent({
          type: 'session-update',
          config: { instructions: 'Answer in French.' },
        }),
      ).toEqual({ type: 'UpdatePrompt', prompt: 'Answer in French.' });
      expect(
        await model.serializeClientEvent({
          type: 'session-update',
          config: {},
        }),
      ).toBeNull();
    });

    it('rejects live updates the agent cannot apply', async () => {
      const model = createModel();
      await model.serializeClientEvent({ type: 'session-update', config: {} });

      expect(() =>
        model.serializeClientEvent({
          type: 'session-update',
          config: { tools: [] },
        }),
      ).toThrow('live update of tools');
      expect(() =>
        model.serializeClientEvent({
          type: 'session-update',
          config: {
            providerOptions: {
              deepgram: {
                think: { provider: 'anthropic', model: 'claude-haiku-4-5' },
              },
            },
          },
        }),
      ).toThrow('live update of providerOptions');
      expect(() =>
        model.serializeClientEvent({
          type: 'session-update',
          config: { voice: 'flux-kit-en', instructions: 'Be terse.' },
        }),
      ).toThrow('live update of voice and instructions in one event');
    });

    it('rejects a live update that disables turn detection', async () => {
      const model = createModel();
      await model.serializeClientEvent({ type: 'session-update', config: {} });

      // `null` is a value here: it asks for turn detection to be turned off.
      expect(() =>
        model.serializeClientEvent({
          type: 'session-update',
          config: { turnDetection: null },
        }),
      ).toThrow('live update of turnDetection');
      expect(() =>
        model.serializeClientEvent({
          type: 'session-update',
          config: { turnDetection: { type: 'disabled' } },
        }),
      ).toThrow('live update of turnDetection');
      // An absent or undefined setting is not a change.
      expect(
        model.serializeClientEvent({
          type: 'session-update',
          config: { turnDetection: undefined, voice: 'flux-kit-en' },
        }),
      ).toMatchObject({ type: 'UpdateSpeak' });
    });

    it.each([
      [
        'a browser connection',
        (model: DeepgramRealtimeModel) =>
          model.getWebSocketConfig({ token: 'token', url: 'wss://example' }),
      ],
      [
        'a server connection',
        (model: DeepgramRealtimeModel) => model.getServerWebSocketConfig(),
      ],
      [
        'a new event parser',
        (model: DeepgramRealtimeModel) => model.createServerEventParser(),
      ],
    ])('sends Settings again after %s starts', async (_, startConnection) => {
      const model = createModel();
      await model.serializeClientEvent({ type: 'session-update', config: {} });

      await startConnection(model);

      expect(
        await model.serializeClientEvent({
          type: 'session-update',
          config: {},
        }),
      ).toMatchObject({ type: 'Settings' });
    });

    it('sends Settings again when building the first one failed', async () => {
      const model = createModel();

      await expect(
        model.serializeClientEvent({
          type: 'session-update',
          config: { outputModalities: ['text'] },
        }),
      ).rejects.toThrow('outputModalities without audio');
      expect(
        await model.serializeClientEvent({
          type: 'session-update',
          config: {},
        }),
      ).toMatchObject({ type: 'Settings' });
    });

    it('sends audio as binary and ends the turn on commit', () => {
      const model = createModel();

      expect(
        model.serializeClientEvent({
          type: 'input-audio-append',
          audio: 'AQID',
        }),
      ).toEqual(new Uint8Array([1, 2, 3]));
      expect(
        model.serializeClientEvent({ type: 'input-audio-commit' }),
      ).toEqual({ type: 'ForceEndTurn' });
    });

    it('injects text messages and returns function results', () => {
      const model = createModel();

      expect(
        model.serializeClientEvent({
          type: 'conversation-item-create',
          item: { type: 'text-message', role: 'user', text: 'Hello' },
        }),
      ).toEqual({ type: 'InjectUserMessage', content: 'Hello' });
      expect(
        model.serializeClientEvent({
          type: 'conversation-item-create',
          item: {
            type: 'function-call-output',
            callId: 'call_1',
            name: 'get_weather',
            output: '{"temperature_c":18}',
          },
        }),
      ).toEqual({
        type: 'FunctionCallResponse',
        id: 'call_1',
        name: 'get_weather',
        content: '{"temperature_c":18}',
      });
    });

    it('requires the function name for function results', () => {
      const model = createModel();

      expect(() =>
        model.serializeClientEvent({
          type: 'conversation-item-create',
          item: { type: 'function-call-output', callId: 'call_1', output: '' },
        }),
      ).toThrow('require the function name');
    });

    it('drops events the agent has no message for', () => {
      const model = createModel();

      expect(
        model.serializeClientEvent({ type: 'input-audio-clear' }),
      ).toBeNull();
      expect(
        model.serializeClientEvent({ type: 'response-create' }),
      ).toBeNull();
      expect(
        model.serializeClientEvent({ type: 'response-cancel' }),
      ).toBeNull();
      expect(
        model.serializeClientEvent({
          type: 'conversation-item-truncate',
          itemId: 'deepgram-item-1',
          contentIndex: 0,
          audioEndMs: 100,
        }),
      ).toBeNull();
      expect(
        model.serializeClientEvent({
          type: 'conversation-item-create',
          item: { type: 'audio-message', role: 'user', audio: 'AQID' },
        }),
      ).toBeNull();
    });
  });

  describe('function calls', () => {
    const request = (...functions: Array<Record<string, unknown>>) => ({
      type: 'FunctionCallRequest',
      functions: functions.map(call => ({
        name: 'get_weather',
        arguments: '{"city":"Paris"}',
        client_side: true,
        ...call,
      })),
    });
    const callIds = (
      events: RealtimeModelV4ServerEvent | RealtimeModelV4ServerEvent[],
    ) =>
      (Array.isArray(events) ? events : [events]).flatMap(event =>
        event.type === 'function-call-arguments-delta' ||
        event.type === 'function-call-arguments-done'
          ? [`${event.type}:${event.callId}`]
          : [],
      );
    const result = (callId: string) =>
      ({
        type: 'conversation-item-create',
        item: {
          type: 'function-call-output',
          callId,
          name: 'get_weather',
          output: '{"temperature_c":18}',
        },
      }) as const;

    it('assigns its own call ID when Deepgram reports <UNKNOWN>', () => {
      const parse = createModel().createServerEventParser();

      expect(callIds(parse(request({ id: '<UNKNOWN>' })))).toEqual([
        'function-call-arguments-delta:deepgram-call-1',
        'function-call-arguments-done:deepgram-call-1',
      ]);
    });

    it('gives every <UNKNOWN> call in a connection a distinct ID', () => {
      const parse = createModel().createServerEventParser();

      expect(callIds(parse(request({ id: '<UNKNOWN>' })))).toEqual([
        'function-call-arguments-delta:deepgram-call-1',
        'function-call-arguments-done:deepgram-call-1',
      ]);
      expect(callIds(parse(request({ id: '<UNKNOWN>' })))).toEqual([
        'function-call-arguments-delta:deepgram-call-2',
        'function-call-arguments-done:deepgram-call-2',
      ]);
      expect(
        callIds(parse(request({ id: '<UNKNOWN>' }, { id: '<UNKNOWN>' }))),
      ).toEqual([
        'function-call-arguments-delta:deepgram-call-3',
        'function-call-arguments-done:deepgram-call-3',
        'function-call-arguments-delta:deepgram-call-4',
        'function-call-arguments-done:deepgram-call-4',
      ]);
    });

    it('emits calls that arrive without an ID', () => {
      const parse = createModel().createServerEventParser();

      expect(parse(request({}, { id: null }))).toMatchObject([
        { type: 'response-created' },
        { type: 'function-call-arguments-delta', callId: 'deepgram-call-1' },
        {
          type: 'function-call-arguments-done',
          callId: 'deepgram-call-1',
          name: 'get_weather',
          arguments: '{"city":"Paris"}',
        },
        { type: 'function-call-arguments-delta', callId: 'deepgram-call-2' },
        { type: 'function-call-arguments-done', callId: 'deepgram-call-2' },
      ]);
    });

    it('returns results under the ID that Deepgram sent', () => {
      const model = createModel();
      const parse = model.createServerEventParser();
      parse(request({ id: '<UNKNOWN>' }, {}, { id: 'call_abc' }));

      expect(model.serializeClientEvent(result('deepgram-call-1'))).toEqual({
        type: 'FunctionCallResponse',
        id: '<UNKNOWN>',
        name: 'get_weather',
        content: '{"temperature_c":18}',
      });
      expect(model.serializeClientEvent(result('deepgram-call-2'))).toEqual({
        type: 'FunctionCallResponse',
        name: 'get_weather',
        content: '{"temperature_c":18}',
      });
      expect(model.serializeClientEvent(result('call_abc'))).toEqual({
        type: 'FunctionCallResponse',
        id: 'call_abc',
        name: 'get_weather',
        content: '{"temperature_c":18}',
      });
    });

    it.each([
      ['a Deepgram call ID', 'call_abc', 'call_abc'],
      ['an <UNKNOWN> call ID', '<UNKNOWN>', 'deepgram-call-1'],
    ])('returns the thought signature for %s', (_, id, callId) => {
      const model = createModel();
      const parse = model.createServerEventParser();

      expect(
        callIds(parse(request({ id, thought_signature: 'signature-1' }))),
      ).toEqual([
        `function-call-arguments-delta:${callId}`,
        `function-call-arguments-done:${callId}`,
      ]);
      expect(model.serializeClientEvent(result(callId))).toEqual({
        type: 'FunctionCallResponse',
        id,
        name: 'get_weather',
        content: '{"temperature_c":18}',
        thought_signature: 'signature-1',
      });
    });

    it('tracks calls parsed with parseServerEvent', () => {
      const model = createModel();

      expect(
        callIds(
          model.parseServerEvent(
            request({ id: '<UNKNOWN>', thought_signature: 'signature-1' }),
          ),
        ),
      ).toEqual([
        'function-call-arguments-delta:deepgram-call-1',
        'function-call-arguments-done:deepgram-call-1',
      ]);
      expect(model.serializeClientEvent(result('deepgram-call-1'))).toEqual({
        type: 'FunctionCallResponse',
        id: '<UNKNOWN>',
        name: 'get_weather',
        content: '{"temperature_c":18}',
        thought_signature: 'signature-1',
      });
    });

    type Parser = ReturnType<DeepgramRealtimeModel['createServerEventParser']>;
    it.each([
      [
        'a browser connection',
        (model: DeepgramRealtimeModel, parse: Parser) => {
          model.getWebSocketConfig({ token: 'token', url: 'wss://example' });
          return parse;
        },
      ],
      [
        'a server connection',
        async (model: DeepgramRealtimeModel, parse: Parser) => {
          await model.getServerWebSocketConfig();
          return parse;
        },
      ],
      [
        'a new event parser',
        (model: DeepgramRealtimeModel) => model.createServerEventParser(),
      ],
    ])('starts over with function calls after %s starts', async (_, start) => {
      const model = createModel();
      const first = model.createServerEventParser();
      first(request({ id: '<UNKNOWN>', thought_signature: 'signature-1' }));

      const parse = await start(model, first);

      expect(callIds(parse(request({})))).toEqual([
        'function-call-arguments-delta:deepgram-call-1',
        'function-call-arguments-done:deepgram-call-1',
      ]);
      expect(model.serializeClientEvent(result('deepgram-call-1'))).toEqual({
        type: 'FunctionCallResponse',
        name: 'get_weather',
        content: '{"temperature_c":18}',
      });
    });
  });

  describe('parseServerEvent', () => {
    it('maps the connection handshake', () => {
      const model = createModel();
      const welcome = { type: 'Welcome', request_id: 'request-1' };
      const applied = { type: 'SettingsApplied' };

      expect(model.parseServerEvent(welcome)).toEqual({
        type: 'session-created',
        sessionId: 'request-1',
        raw: welcome,
      });
      expect(model.parseServerEvent(applied)).toEqual({
        type: 'session-updated',
        raw: applied,
      });
      expect(
        eventTypes(model.parseServerEvent({ type: 'PromptUpdated' })),
      ).toEqual(['session-updated']);
      expect(
        eventTypes(model.parseServerEvent({ type: 'SpeakUpdated' })),
      ).toEqual(['session-updated']);
    });

    it('maps a spoken exchange to one response', () => {
      const parse = createModel().createServerEventParser();
      const userText = {
        type: 'ConversationText',
        role: 'user',
        content: 'What is the capital of France?',
      };
      const audio = new Uint8Array([1, 2, 3]);
      const first = {
        type: 'ConversationText',
        role: 'assistant',
        content: 'The capital of France is Paris.',
      };
      const second = {
        type: 'ConversationText',
        role: 'assistant',
        content: 'Anything else?',
      };
      const done = { type: 'AgentAudioDone' };
      const ids = { responseId: 'deepgram-resp-1', itemId: 'deepgram-item-1' };

      expect(parse({ type: 'UserStartedSpeaking' })).toEqual({
        type: 'speech-started',
        raw: { type: 'UserStartedSpeaking' },
      });
      expect(parse(userText)).toEqual({
        type: 'input-transcription-completed',
        itemId: 'deepgram-input-1',
        transcript: 'What is the capital of France?',
        raw: userText,
      });
      // Agent audio can arrive before the text it speaks.
      expect(parse(audio)).toEqual([
        { type: 'response-created', responseId: ids.responseId, raw: audio },
        { type: 'audio-delta', ...ids, delta: 'AQID', raw: audio },
      ]);
      expect(parse(first)).toEqual({
        type: 'audio-transcript-delta',
        ...ids,
        delta: 'The capital of France is Paris.',
        raw: first,
      });
      expect(parse(second)).toEqual({
        type: 'audio-transcript-delta',
        ...ids,
        delta: ' Anything else?',
        raw: second,
      });
      expect(parse(done)).toEqual([
        { type: 'audio-done', ...ids, raw: done },
        {
          type: 'audio-transcript-done',
          ...ids,
          transcript: 'The capital of France is Paris. Anything else?',
          raw: done,
        },
        {
          type: 'response-done',
          responseId: ids.responseId,
          status: 'completed',
          raw: done,
        },
      ]);
      expect(eventTypes(parse({ ...first }))).toEqual([
        'response-created',
        'audio-transcript-delta',
      ]);
    });

    it('accepts binary audio as an ArrayBuffer or a view into one', () => {
      const parse = createModel().createServerEventParser();

      expect(parse(new Uint8Array([1, 2, 3]).buffer)).toMatchObject([
        { type: 'response-created' },
        { type: 'audio-delta', delta: 'AQID' },
      ]);
      // Node.js hands out frames as views into a larger pooled buffer.
      expect(
        parse(new Uint8Array(new Uint8Array([0, 4, 5, 6, 0]).buffer, 1, 3)),
      ).toMatchObject({ type: 'audio-delta', delta: 'BAUG' });
    });

    it('maps client-side function calls into the agent response', () => {
      const parse = createModel().createServerEventParser();
      const request = {
        type: 'FunctionCallRequest',
        functions: [
          {
            id: 'call_1',
            name: 'get_weather',
            arguments: '{"city":"Paris"}',
            client_side: true,
          },
          {
            id: 'call_2',
            name: 'end_call',
            arguments: '{}',
            client_side: false,
          },
        ],
      };
      const ids = { responseId: 'deepgram-resp-1', itemId: 'deepgram-item-1' };

      expect(parse(request)).toEqual([
        { type: 'response-created', responseId: ids.responseId, raw: request },
        {
          type: 'function-call-arguments-delta',
          ...ids,
          callId: 'call_1',
          delta: '{"city":"Paris"}',
          raw: request,
        },
        {
          type: 'function-call-arguments-done',
          ...ids,
          callId: 'call_1',
          name: 'get_weather',
          arguments: '{"city":"Paris"}',
          raw: request,
        },
      ]);
      // The spoken answer that follows the function result joins the response.
      expect(
        parse({
          type: 'ConversationText',
          role: 'assistant',
          content: 'It is 18 degrees in Paris.',
        }),
      ).toMatchObject({ type: 'audio-transcript-delta', ...ids });
      expect(eventTypes(parse({ type: 'AgentAudioDone' }))).toEqual([
        'audio-transcript-done',
        'response-done',
      ]);
    });

    it('leaves server-side function calls to Deepgram', () => {
      const parse = createModel().createServerEventParser();
      const request = {
        type: 'FunctionCallRequest',
        functions: [
          {
            id: 'call_1',
            name: 'end_call',
            arguments: '{}',
            client_side: false,
          },
        ],
      };

      expect(parse(request)).toEqual({
        type: 'custom',
        rawType: 'FunctionCallRequest',
        raw: request,
      });
    });

    it('ends the agent response when the user interrupts', () => {
      const parse = createModel().createServerEventParser();
      const started = { type: 'UserStartedSpeaking' };
      parse(new Uint8Array([1, 2, 3]));

      expect(parse(started)).toEqual([
        { type: 'speech-started', raw: started },
        {
          type: 'audio-done',
          responseId: 'deepgram-resp-1',
          itemId: 'deepgram-item-1',
          raw: started,
        },
        {
          type: 'response-done',
          responseId: 'deepgram-resp-1',
          status: 'cancelled',
          raw: started,
        },
      ]);
      expect(parse({ type: 'AgentAudioDone' })).toEqual({
        type: 'custom',
        rawType: 'AgentAudioDone',
        raw: { type: 'AgentAudioDone' },
      });
      expect(parse(new Uint8Array([1]))).toMatchObject([
        { type: 'response-created', responseId: 'deepgram-resp-2' },
        { type: 'audio-delta', itemId: 'deepgram-item-2' },
      ]);
    });

    it('maps errors and passes other messages through as custom events', () => {
      const model = createModel();
      const error = {
        type: 'Error',
        description:
          'Received Settings when settings were already established.',
        code: 'SETTINGS_ALREADY_APPLIED',
      };
      const warning = {
        type: 'Warning',
        description: 'Prompt is too long.',
        code: 'PROMPT_TOO_LONG',
      };

      expect(model.parseServerEvent(error)).toEqual({
        type: 'error',
        message: 'Received Settings when settings were already established.',
        code: 'SETTINGS_ALREADY_APPLIED',
        raw: error,
      });
      expect(model.parseServerEvent(warning)).toEqual({
        type: 'custom',
        rawType: 'Warning',
        raw: warning,
      });
      expect(
        model.parseServerEvent({ type: 'LatencyReport', tts_latency: 0.1 }),
      ).toMatchObject({ type: 'custom', rawType: 'LatencyReport' });
      expect(model.parseServerEvent({})).toMatchObject({
        type: 'custom',
        rawType: 'unknown',
      });
    });

    it('tracks responses separately for each connection', () => {
      const model = createModel();
      const first = model.createServerEventParser();
      const second = model.createServerEventParser();

      first(new Uint8Array([1]));
      first({ type: 'AgentAudioDone' });

      expect(first(new Uint8Array([1]))).toMatchObject([
        { responseId: 'deepgram-resp-2' },
        { responseId: 'deepgram-resp-2' },
      ]);
      expect(second(new Uint8Array([1]))).toMatchObject([
        { responseId: 'deepgram-resp-1' },
        { responseId: 'deepgram-resp-1' },
      ]);
    });
  });
});
