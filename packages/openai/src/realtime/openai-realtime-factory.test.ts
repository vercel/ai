import {
  InvalidArgumentError,
  UnsupportedFunctionalityError,
} from '@ai-sdk/provider';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createOpenAI,
  Experimental_OpenAIRealtimeModel as OpenAIRealtimeModel,
  Experimental_OpenAIRealtimeModelLive as OpenAIRealtimeModelLive,
  type Experimental_OpenAIRealtimeOptions as OpenAIRealtimeOptions,
} from '../index';

afterEach(() => vi.unstubAllEnvs());

describe('OpenAI realtime factory', () => {
  it('exposes one public factory', () => {
    expect(createOpenAI()).not.toHaveProperty('experimental_live');
  });

  it.each([
    ['gpt-live-1', undefined, OpenAIRealtimeModelLive],
    ['gpt-live-1', {}, OpenAIRealtimeModelLive],
    ['gpt-live-1', { api: undefined }, OpenAIRealtimeModelLive],
    ['gpt-realtime', undefined, OpenAIRealtimeModel],
    ['unknown', undefined, OpenAIRealtimeModel],
    ['gpt-live', undefined, OpenAIRealtimeModel],
    ['gpt-live-1-preview', undefined, OpenAIRealtimeModel],
    ['prefix-gpt-live-1', undefined, OpenAIRealtimeModel],
    ['GPT-LIVE-1', undefined, OpenAIRealtimeModel],
    ['not-yet-released', { api: 'live' }, OpenAIRealtimeModelLive],
    ['gpt-realtime', { api: 'live' }, OpenAIRealtimeModelLive],
    ['gpt-live-1', { api: 'realtime' }, OpenAIRealtimeModel],
  ] as const)('routes %s with %j', (modelId, options, implementation) => {
    const model = createOpenAI().experimental_realtime(modelId, options);
    expect(model).toBeInstanceOf(implementation);
    expect(model.modelId).toBe(modelId);
    expect(model.specificationVersion).toBe('v4');
  });

  it.each(['invalid', '', null, false, 1, {}])(
    'rejects an invalid selector %j in construction and token minting',
    async api => {
      const customFetch = vi.fn();
      const factory = createOpenAI({
        fetch: customFetch,
      }).experimental_realtime;
      const options = { api } as OpenAIRealtimeOptions;
      expect(() => factory('gpt-live-1', options)).toThrow(
        InvalidArgumentError,
      );
      expect(() => factory('unknown', options)).toThrow(
        'OpenAI realtime api must be "live" or "realtime".',
      );
      await expect(
        factory.getToken({ model: 'gpt-live-1', ...options }),
      ).rejects.toBeInstanceOf(InvalidArgumentError);
      expect(customFetch).not.toHaveBeenCalled();
    },
  );

  it.each(['live', 'realtime'] as const)(
    'constructs %s codecs without an API key or network request',
    api => {
      vi.stubEnv('OPENAI_API_KEY', '');
      const customFetch = vi.fn();
      const model = createOpenAI({ fetch: customFetch }).experimental_realtime(
        'not-yet-released',
        { api },
      );
      expect(model.buildSessionConfig({})).toMatchObject({
        model: 'not-yet-released',
      });
      expect(model.parseServerEvent({ type: 'unknown' })).toBeDefined();
      expect(
        model.serializeClientEvent({
          type: 'input-audio-append',
          audio: 'AA==',
        }),
      ).toBeDefined();
      expect(customFetch).not.toHaveBeenCalled();
    },
  );

  it.each(['live', 'realtime'] as const)(
    'forwards the shared constructor configuration to %s without serializing the selector',
    api => {
      const customFetch = vi.fn();
      const model = createOpenAI({
        apiKey: 'test-key',
        baseURL: 'https://example.com/proxy/v1/',
        headers: { 'X-Custom': 'value' },
        fetch: customFetch,
        name: 'custom',
      }).experimental_realtime('not-yet-released', { api });
      expect(model.provider).toBe(`custom.${api}`);
      expect(model).toHaveProperty(
        'config.baseURL',
        'https://example.com/proxy/v1',
      );
      // Live's WS-only adapter retains fetch for HTTP-capable transports.
      expect(model).toHaveProperty('config.fetch', customFetch);
      expect(model.buildSessionConfig({})).not.toHaveProperty('api');
      if (model instanceof OpenAIRealtimeModelLive) {
        expect(model.getServerWebSocketConfig()).toMatchObject({
          url: 'wss://example.com/proxy/v1/live/sessions',
          headers: { authorization: 'Bearer test-key', 'x-custom': 'value' },
        });
        expect(
          model.serializeClientEvent({ type: 'session-start', config: {} }),
        ).toMatchObject({ session: { model: 'not-yet-released' } });
        expect(
          model.serializeClientEvent({ type: 'session-start', config: {} }),
        ).not.toHaveProperty('session.api');
      }
    },
  );
});

describe('OpenAI realtime factory getToken', () => {
  it.each([
    { model: 'gpt-live-1' },
    { model: 'not-yet-released', api: 'live' },
    { model: 'gpt-realtime', api: 'live' },
  ] as const)(
    'rejects Live credentials without fetching (%j)',
    async options => {
      vi.stubEnv('OPENAI_API_KEY', '');
      const customFetch = vi.fn();
      const factory = createOpenAI({
        fetch: customFetch,
      }).experimental_realtime;
      await expect(factory.getToken(options)).rejects.toBeInstanceOf(
        UnsupportedFunctionalityError,
      );
      await expect(factory.getToken(options)).rejects.toThrow(
        'Use server WebSocket setup via getServerWebSocketConfig()',
      );
      expect(customFetch).not.toHaveBeenCalled();
    },
  );

  it.each([
    { model: 'gpt-realtime' },
    { model: 'unknown' },
    { model: 'gpt-live-1-preview' },
    { model: 'gpt-live-1', api: 'realtime' },
  ] as const)(
    'preserves the Realtime mint request and result (%j)',
    async options => {
      const customFetch = vi
        .fn<typeof fetch>()
        .mockResolvedValue(Response.json({ value: 'secret', expires_at: 123 }));
      const factory = createOpenAI({
        apiKey: 'test-key',
        baseURL: 'https://example.com/proxy/v1/',
        organization: 'org-test',
        project: 'proj-test',
        headers: { 'X-Custom': 'value' },
        fetch: customFetch,
      }).experimental_realtime;

      await expect(
        factory.getToken({ ...options, expiresAfterSeconds: 60 }),
      ).resolves.toEqual({
        token: 'secret',
        url: `wss://example.com/v1/realtime?model=${options.model}`,
        expiresAt: 123,
      });
      expect(customFetch).toHaveBeenCalledExactlyOnceWith(
        'https://example.com/proxy/v1/realtime/client_secrets',
        {
          method: 'POST',
          headers: expect.objectContaining({
            authorization: 'Bearer test-key',
            'openai-organization': 'org-test',
            'openai-project': 'proj-test',
            'x-custom': 'value',
            'Content-Type': 'application/json',
          }),
          body: JSON.stringify({
            session: { type: 'realtime', model: options.model },
            expires_after: { anchor: 'created_at', seconds: 60 },
          }),
        },
      );
    },
  );

  it('forwards session configuration and omits unspecified expiry', async () => {
    const customFetch = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ value: 'secret' }));
    await createOpenAI({
      apiKey: 'test-key',
      fetch: customFetch,
    }).experimental_realtime.getToken({
      model: 'gpt-realtime',
      sessionConfig: { instructions: 'Be concise.' },
    });
    const body = JSON.parse(String(customFetch.mock.calls[0][1]?.body));
    expect(body.session).toMatchObject({
      type: 'realtime',
      model: 'gpt-realtime',
      instructions: 'Be concise.',
    });
    expect(body).not.toHaveProperty('expires_after');
  });

  it('does not fall back to Live after a Realtime HTTP error', async () => {
    const customFetch = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('Unknown model', { status: 404 }));
    await expect(
      createOpenAI({
        apiKey: 'test-key',
        fetch: customFetch,
      }).experimental_realtime.getToken({ model: 'not-yet-released' }),
    ).rejects.toThrow('404 Unknown model');
    expect(customFetch).toHaveBeenCalledTimes(1);
  });
});
