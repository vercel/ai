import {
  InvalidArgumentError,
  UnsupportedFunctionalityError,
  type Experimental_RealtimeModelV4ClientEvent as RealtimeClientEvent,
} from '@ai-sdk/provider';
import { describe, expect, it, vi } from 'vitest';
import {
  GATEWAY_AUTH_SUBPROTOCOL_PREFIX,
  GATEWAY_REALTIME_SUBPROTOCOL,
  getGatewayRealtimeTeamIdOrSlug,
} from './gateway-realtime-auth';
import { GatewayLiveModel } from './gateway-live-model';
import { GatewayRealtimeModel } from './gateway-realtime-model';
import { createGateway } from './gateway-provider';

vi.mock('./vercel-environment', () => ({
  getVercelOidcToken: vi.fn(),
  getVercelRequestId: vi.fn(),
}));

const serverOnlyIt = typeof globalThis.window === 'undefined' ? it : it.skip;

const createTestModel = ({
  modelId = 'openai/gpt-live-1.1',
  baseURL = 'https://ai-gateway.vercel.sh/v4/ai',
  teamIdOrSlug,
  createClientSecret = vi.fn(async () => ({ token: 'vcst_test-secret' })),
}: {
  modelId?: string;
  baseURL?: string;
  teamIdOrSlug?: string;
  createClientSecret?: ConstructorParameters<
    typeof GatewayLiveModel
  >[1]['createClientSecret'];
} = {}) =>
  new GatewayLiveModel(modelId, {
    provider: 'gateway.live',
    baseURL,
    ...(teamIdOrSlug !== undefined && { teamIdOrSlug }),
    createClientSecret,
    getHeaders: async () => ({
      Authorization: 'Bearer vck_test-token',
      'x-unset': undefined,
    }),
  });

const liveUrl =
  'wss://ai-gateway.vercel.sh/v4/ai/live-model?ai-model-id=openai%2Fgpt-live-1.1';

describe('GatewayLiveModel', () => {
  it('declares continuous Live capabilities', () => {
    const model = createTestModel();
    expect(model.specificationVersion).toBe('v4');
    expect(model.provider).toBe('gateway.live');
    expect(model.modelId).toBe('openai/gpt-live-1.1');
    expect(model.capabilities).toEqual({
      conversation: 'continuous',
      transports: ['websocket'],
      connections: ['client-secret-websocket', 'server-websocket'],
      startup: 'session-start',
      finalization: 'session-close',
    });
  });

  describe('doCreateClientSecret', () => {
    it('mints a Live-bound secret and returns the live-model url', async () => {
      const createClientSecret = vi.fn(async () => ({
        token: 'vcst_live',
        expiresAt: 1_700_000_060,
      }));
      const result = await createTestModel({
        createClientSecret,
      }).doCreateClientSecret({ expiresAfterSeconds: 120 });
      expect(createClientSecret).toHaveBeenCalledWith({
        modelId: 'openai/gpt-live-1.1',
        routeKind: 'live',
        expiresAfterSeconds: 120,
      });
      expect(result).toEqual({
        token: 'vcst_live',
        url: liveUrl,
        expiresAt: 1_700_000_060,
      });
    });

    it('upgrades an http base url to ws', async () => {
      const result = await createTestModel({
        baseURL: 'http://localhost:3000/v4/ai',
      }).doCreateClientSecret();
      expect(result.url).toBe(
        'ws://localhost:3000/v4/ai/live-model?ai-model-id=openai%2Fgpt-live-1.1',
      );
    });
  });

  it('carries the token and team scope in WebSocket subprotocols', () => {
    const config = createTestModel({
      teamIdOrSlug: 'my-team',
    }).getWebSocketConfig({ token: 'vcst_x', url: liveUrl });
    expect(config.url).toBe(liveUrl);
    expect(config.protocols?.slice(0, 2)).toEqual([
      GATEWAY_REALTIME_SUBPROTOCOL,
      `${GATEWAY_AUTH_SUBPROTOCOL_PREFIX}vcst_x`,
    ]);
    expect(getGatewayRealtimeTeamIdOrSlug(config.protocols?.join(', '))).toBe(
      'my-team',
    );
  });

  it('returns the live-model url and defined headers for server connections', async () => {
    const descriptor = await createTestModel().getServerWebSocketConfig();
    expect(descriptor).toEqual({
      url: liveUrl,
      headers: { Authorization: 'Bearer vck_test-token' },
    });
  });

  it('rejects non-conversation intents', async () => {
    const model = createTestModel();
    const options = { intent: 'transcription' } as const;
    await expect(model.getServerWebSocketConfig(options)).rejects.toThrow(
      /does not support the 'transcription' session intent/,
    );
    expect(() =>
      model.serializeClientEvent({ type: 'session-close' }, options),
    ).toThrow(/does not support/);
    expect(() => model.buildSessionConfig({}, options)).toThrow(
      /does not support/,
    );
  });

  describe('serializeClientEvent', () => {
    it('adds the model id to session-start', () => {
      expect(
        createTestModel().serializeClientEvent({
          type: 'session-start',
          eventId: 'start-1',
          config: {
            instructions: 'Be brief.',
            voice: 'marin',
            inputAudioFormat: { type: 'audio/pcm', rate: 24000 },
            outputAudioFormat: { type: 'audio/pcm', rate: 24000 },
            providerOptions: {
              gateway: { tags: ['demo'] },
              openai: { delegation: { type: 'client' } },
            },
          },
        }),
      ).toEqual({
        type: 'session-start',
        modelId: 'openai/gpt-live-1.1',
        eventId: 'start-1',
        config: {
          instructions: 'Be brief.',
          voice: 'marin',
          inputAudioFormat: { type: 'audio/pcm', rate: 24000 },
          outputAudioFormat: { type: 'audio/pcm', rate: 24000 },
          providerOptions: {
            gateway: { tags: ['demo'] },
            openai: { delegation: { type: 'client' } },
          },
        },
      });
    });

    it.each([
      [{ type: 'session-close' }, { type: 'session-close' }],
      [
        { type: 'session-close', eventId: 'close-1' },
        { type: 'session-close', eventId: 'close-1' },
      ],
      [{ type: 'input-audio-mute' }, { type: 'input-audio-mute' }],
      [{ type: 'input-audio-unmute' }, { type: 'input-audio-unmute' }],
      [
        { type: 'input-audio-append', audio: 'AAAA' },
        { type: 'input-audio-append', audio: 'AAAA' },
      ],
      [
        { type: 'context-append', content: 'Note', delegationId: null },
        { type: 'context-append', content: 'Note', delegationId: null },
      ],
      [
        {
          type: 'context-append',
          content: 'Checking',
          delegationId: 'd1',
          eventId: 'ctx-1',
          providerOptions: { openai: { channel: 'thinking' } },
        },
        {
          type: 'context-append',
          content: 'Checking',
          delegationId: 'd1',
          eventId: 'ctx-1',
          providerOptions: { openai: { channel: 'thinking' } },
        },
      ],
    ] satisfies Array<[RealtimeClientEvent, unknown]>)(
      'maps %o to the normalized Live event',
      (event, expected) => {
        expect(createTestModel().serializeClientEvent(event)).toEqual(expected);
      },
    );

    it.each([
      { type: 'session-update', config: {} },
      { type: 'input-audio-commit' },
      { type: 'input-audio-clear' },
      { type: 'response-create' },
      { type: 'response-cancel' },
    ] satisfies RealtimeClientEvent[])(
      'rejects $type, which Live does not accept',
      event => {
        expect(() => createTestModel().serializeClientEvent(event)).toThrow(
          UnsupportedFunctionalityError,
        );
      },
    );
  });

  describe('buildSessionConfig', () => {
    it.each(['tools', 'turnDetection', 'outputModalities'] as const)(
      'rejects the unsupported %s setting',
      key => {
        expect(() =>
          createTestModel().buildSessionConfig({
            [key]: key === 'turnDetection' ? { type: 'server-vad' } : [],
          }),
        ).toThrow(`AI Gateway Live session setting: ${key}`);
      },
    );

    it('ignores unset settings', () => {
      expect(
        createTestModel().buildSessionConfig({
          instructions: 'Hi',
          tools: undefined,
          turnDetection: null,
        }),
      ).toEqual({ instructions: 'Hi' });
    });

    it.each([
      { type: 'audio/pcm', rate: 48000 },
      { type: 'audio/pcm' },
      { type: 'audio/pcmu', rate: 16000 },
      { type: 'audio/opus', rate: 24000 },
    ])('rejects the unsupported audio format %o', format => {
      expect(() =>
        createTestModel().buildSessionConfig({ inputAudioFormat: format }),
      ).toThrow(UnsupportedFunctionalityError);
    });

    it('accepts the supported audio formats', () => {
      for (const format of [
        { type: 'audio/pcm', rate: 16000 },
        { type: 'audio/pcm', rate: 24000 },
        { type: 'audio/pcma', rate: 8000 },
        { type: 'audio/pcmu', rate: 8000 },
      ]) {
        expect(
          createTestModel().buildSessionConfig({
            inputAudioFormat: format,
            outputAudioFormat: format,
          }),
        ).toEqual({ inputAudioFormat: format, outputAudioFormat: format });
      }
    });

    it('requires matching input and output formats', () => {
      expect(() =>
        createTestModel().buildSessionConfig({
          inputAudioFormat: { type: 'audio/pcm', rate: 16000 },
          outputAudioFormat: { type: 'audio/pcm', rate: 24000 },
        }),
      ).toThrow(InvalidArgumentError);
    });
  });

  describe('parseServerEvent', () => {
    it('passes normalized events through', () => {
      const event = {
        type: 'session-closed',
        sessionId: 'live_1',
        usage: { seconds: 14 },
        reason: 'close_requested',
        raw: { type: 'session.closed' },
      };
      expect(createTestModel().parseServerEvent(event)).toBe(event);
    });

    it('keeps Gateway error frames as raw', () => {
      const frame = {
        type: 'error',
        code: 'invalid_request_error',
        message: 'Live requires a canonical model slug',
      };
      expect(createTestModel().parseServerEvent(frame)).toEqual({
        ...frame,
        raw: frame,
      });
    });

    it.each([null, 'text', [], {}, { type: 1 }])(
      'reports %o as an invalid server event',
      raw => {
        expect(createTestModel().parseServerEvent(raw)).toEqual({
          type: 'error',
          code: 'invalid_server_event',
          message: 'Invalid AI Gateway Live server event.',
          raw,
        });
      },
    );
  });
});

describe('gateway.experimental_realtime Live routing', () => {
  const gateway = createGateway({ apiKey: 'vck_test-token' });

  it.each(['openai/gpt-live-1', 'openai/gpt-live-1.1'])(
    'creates a Live model for %s',
    modelId => {
      const model = gateway.experimental_realtime(modelId);
      expect(model).toBeInstanceOf(GatewayLiveModel);
      expect(model.provider).toBe('gateway.live');
    },
  );

  it.each([
    'openai/gpt-realtime-2',
    'google/gemini-3.8-live',
    'spacexai/grok-voice-3.0',
  ])('keeps %s on the realtime route', modelId => {
    const model = gateway.experimental_realtime(modelId);
    expect(model).toBeInstanceOf(GatewayRealtimeModel);
    expect(model.provider).toBe('gateway.realtime');
  });

  it('honors an explicit api option', () => {
    expect(
      gateway.experimental_realtime('openai/gpt-live-2', { api: 'live' }),
    ).toBeInstanceOf(GatewayLiveModel);
    expect(
      gateway.experimental_realtime('openai/gpt-live-1.1', { api: 'realtime' }),
    ).toBeInstanceOf(GatewayRealtimeModel);
  });

  it('rejects an unknown api option', () => {
    expect(() =>
      gateway.experimental_realtime('openai/gpt-live-1.1', {
        api: 'other' as 'live',
      }),
    ).toThrow(InvalidArgumentError);
  });

  serverOnlyIt(
    'mints a Live token with routeKind live and returns the live-model url',
    async () => {
      const fetch = vi.fn(
        async (_input: string | URL | Request, _init?: RequestInit) =>
          new Response(
            JSON.stringify({ token: 'vcst_live', expiresAt: 1_700_000_060 }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          ),
      );
      const mintGateway = createGateway({ apiKey: 'vck_test-token', fetch });

      const result = await mintGateway.experimental_realtime.getToken({
        model: 'openai/gpt-live-1.1',
        expiresAfterSeconds: 60,
      });

      expect(result).toEqual({
        token: 'vcst_live',
        url: liveUrl,
        expiresAt: 1_700_000_060,
      });
      expect(fetch.mock.calls[0]?.[0]).toBe(
        'https://ai-gateway.vercel.sh/v1/realtime/client-secrets',
      );
      const init = fetch.mock.calls[0]?.[1] as RequestInit;
      expect(JSON.parse(init.body as string)).toEqual({
        model: 'openai/gpt-live-1.1',
        routeKind: 'live',
        expiresIn: 60,
      });
    },
  );

  serverOnlyIt(
    'routes getToken by the api option and leaves realtime mints unchanged',
    async () => {
      const fetch = vi.fn(
        async (_input: string | URL | Request, _init?: RequestInit) =>
          new Response(JSON.stringify({ token: 'vcst_x' }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
      );
      const mintGateway = createGateway({ apiKey: 'vck_test-token', fetch });

      const live = await mintGateway.experimental_realtime.getToken({
        model: 'openai/gpt-live-2',
        api: 'live',
      });
      const realtime = await mintGateway.experimental_realtime.getToken({
        model: 'openai/gpt-live-1.1',
        api: 'realtime',
      });

      expect(live.url).toContain('/v4/ai/live-model?');
      expect(realtime.url).toContain('/v4/ai/realtime-model?');
      const bodies = fetch.mock.calls.map(call =>
        JSON.parse((call[1] as RequestInit).body as string),
      );
      expect(bodies).toEqual([
        { model: 'openai/gpt-live-2', routeKind: 'live' },
        { model: 'openai/gpt-live-1.1' },
      ]);
    },
  );
});
