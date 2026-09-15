import {
  InvalidArgumentError,
  UnsupportedFunctionalityError,
  type Experimental_RealtimeModelV4 as RealtimeModelV4,
  type Experimental_RealtimeModelV4ClientEvent as RealtimeModelV4ClientEvent,
} from '@ai-sdk/provider';
import { describe, expect, it } from 'vitest';
import {
  createOpenAI,
  type Experimental_OpenAIRealtimeModelLiveOptions as OpenAIRealtimeModelLiveOptions,
} from '../index';

const options = {
  delegation: {
    type: 'client',
  },
} satisfies OpenAIRealtimeModelLiveOptions;

describe('OpenAIRealtimeModelLive', () => {
  const model = createOpenAI({ apiKey: 'test-key' }).experimental_realtime(
    'gpt-live-1',
  );

  it('implements the existing v4 spec and declares continuous server WebSocket support', () => {
    const realtime: RealtimeModelV4 = model;
    expect(realtime.specificationVersion).toBe('v4');
    expect(realtime.provider).toBe('openai.live');
    expect(realtime.modelId).toBe('gpt-live-1');
    expect(realtime.capabilities).toEqual({
      conversation: 'continuous',
      transports: ['websocket'],
      connections: ['server-websocket'],
      startup: 'session-start',
      finalization: 'session-close',
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
    }).experimental_realtime('gpt-live-1');
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
        .experimental_realtime('gpt-live-1')
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
          type: 'client',
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
});
