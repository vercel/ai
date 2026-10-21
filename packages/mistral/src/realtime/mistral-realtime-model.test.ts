import {
  APICallError,
  UnsupportedFunctionalityError,
  type Experimental_RealtimeModelV4SessionConfig as RealtimeModelV4SessionConfig,
} from '@ai-sdk/provider';
import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import { describe, expect, it, vi } from 'vitest';
import { createMistral } from '../mistral-provider';
import { MistralRealtimeModel } from './mistral-realtime-model';
import { buildMistralRealtimeSessionConfig } from './mistral-realtime-model-options';

vi.mock('../version', () => ({ VERSION: '0.0.0-test' }));

const url = 'https://api.mistral.ai/v1/audio/sessions';
const sessionId = 'session-1';
const server = createTestServer({ [url]: {}, [`${url}/${sessionId}`]: {} });
const provider = createMistral({ apiKey: 'test-api-key' });

function prepareSessionResponse() {
  server.urls[url].response = {
    type: 'json-value',
    body: {
      id: sessionId,
      participant_token: 'participant-token',
      server_url: 'wss://voice.example.com',
      unused: 'not returned',
    },
  };
}

describe('Mistral realtime factory', () => {
  it('creates a browser model without loading an API key', () => {
    const model = createMistral().experimental_realtime('mistral-small-latest');
    expect(model).toBeInstanceOf(MistralRealtimeModel);
    expect(model).toMatchObject({
      modelId: 'mistral-small-latest',
      provider: 'mistral.realtime',
      specificationVersion: 'v4',
      capabilities: {
        transports: ['webrtc'],
        connections: ['provider'],
        conversation: 'turn-based',
      },
    });
  });

  it('creates a managed session and returns only its browser credentials', async () => {
    prepareSessionResponse();
    const session = await provider.experimental_realtime.createSession({
      model: 'mistral-small-latest',
    });
    expect(session).toEqual({
      id: sessionId,
      participantToken: 'participant-token',
      serverUrl: 'wss://voice.example.com',
    });
    expect(server.calls[0].requestMethod).toBe('POST');
    expect(await server.calls[0].requestBodyJson).toEqual({
      llm: { model: 'mistral-small-latest' },
    });
    expect(server.calls[0].requestHeaders).toMatchObject({
      authorization: 'Bearer test-api-key',
      'content-type': 'application/json',
    });
    expect(server.calls[0].requestUserAgent).toContain(
      'ai-sdk-mistral/0.0.0-test',
    );
  });

  it('maps normalized and provider-specific session settings', async () => {
    prepareSessionResponse();
    await provider.experimental_realtime.createSession({
      model: 'mistral-small-latest',
      sessionConfig: {
        instructions: 'Be concise.',
        voice: 'voice_447',
        outputModalities: ['audio', 'text'],
        outputAudioTranscription: {},
        inputAudioTranscription: {
          model: 'voxtral-mini-transcribe-realtime-3',
          language: 'en',
        },
        tools: [
          { type: 'function', name: 'weather', parameters: { type: 'object' } },
        ],
        providerOptions: {
          mistral: {
            stt: {
              model: 'overridden-model',
              language: 'fr',
              contextBias: ['Vercel'],
              targetStreamingDelayMs: 240,
              turnDetection: { minSilenceMs: 500, endThreshold: 0.33 },
            },
            tts: {
              model: 'voxtral-mini-tts-3',
              voiceId: 'overridden-voice',
              phonemeHints: { SDK: ['s'] },
            },
            turn: {
              allowInterruptions: false,
              inactivity: {
                timeoutMs: 10000,
                maxReminders: 2,
                messages: ['Hello?'],
              },
            },
            welcomeMessage: 'Hello!',
            agentId: 'saved-agent',
            agentVersion: 2,
          },
        },
      },
    });
    expect(await server.calls[0].requestBodyJson).toEqual({
      llm: { model: 'mistral-small-latest' },
      instructions: 'Be concise.',
      stt: {
        model: 'voxtral-mini-transcribe-realtime-3',
        language: 'en',
        context_bias: ['Vercel'],
        target_streaming_delay_ms: 240,
        turn_detection: { min_silence_ms: 500, end_threshold: 0.33 },
      },
      tts: {
        model: 'voxtral-mini-tts-3',
        voice_id: 'voice_447',
        phoneme_hints: { SDK: ['s'] },
      },
      tools: [
        {
          type: 'function',
          function: { name: 'weather', parameters: { type: 'object' } },
        },
      ],
      turn: {
        allow_interruptions: false,
        inactivity: {
          timeout_ms: 10000,
          max_reminders: 2,
          messages: ['Hello?'],
        },
      },
      welcome_message: 'Hello!',
      agent_id: 'saved-agent',
      agent_version: 2,
    });
  });

  it('uses custom URL, headers, fetch and abort signal for create and close', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          id: sessionId,
          participant_token: 'token',
          server_url: 'wss://voice.example.com',
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const abortSignal = new AbortController().signal;
    const custom = createMistral({
      baseURL: 'https://proxy.example.com/v1/',
      apiKey: 'custom-key',
      headers: { 'x-custom': 'custom' },
      fetch,
    });
    await custom.experimental_realtime.createSession({
      model: 'custom-model',
      abortSignal,
    });
    await custom.experimental_realtime.closeSession({
      sessionId: 'session/1?query',
      abortSignal,
    });
    expect(fetch.mock.calls[0][0]).toBe(
      'https://proxy.example.com/v1/audio/sessions',
    );
    expect(fetch.mock.calls[1][0]).toBe(
      'https://proxy.example.com/v1/audio/sessions/session%2F1%3Fquery',
    );
    expect(fetch.mock.calls[0][1]).toMatchObject({
      method: 'POST',
      signal: abortSignal,
      headers: { authorization: 'Bearer custom-key', 'x-custom': 'custom' },
    });
    expect(fetch.mock.calls[1][1]).toMatchObject({
      method: 'DELETE',
      signal: abortSignal,
      headers: { authorization: 'Bearer custom-key', 'x-custom': 'custom' },
    });
  });

  it('accepts an empty successful close response', async () => {
    server.urls[`${url}/${sessionId}`].response = {
      type: 'empty',
      status: 204,
    };
    await expect(
      provider.experimental_realtime.closeSession({ sessionId }),
    ).resolves.toBeUndefined();
    expect(server.calls[0].requestMethod).toBe('DELETE');
  });

  it.each(['create', 'close'])('reports %s HTTP errors', async operation => {
    const endpoint = operation === 'create' ? url : `${url}/${sessionId}`;
    server.urls[endpoint].response = {
      type: 'error',
      status: 401,
      body: JSON.stringify({
        object: 'error',
        message: 'Invalid key',
        type: 'authentication',
        param: null,
        code: null,
      }),
    };
    const promise =
      operation === 'create'
        ? provider.experimental_realtime.createSession({
            model: 'mistral-small-latest',
          })
        : provider.experimental_realtime.closeSession({ sessionId });
    await expect(promise).rejects.toMatchObject({
      message: 'Invalid key',
      statusCode: 401,
    });
  });

  it('rejects malformed session credentials', async () => {
    server.urls[url].response = { type: 'json-value', body: { id: sessionId } };
    await expect(
      provider.experimental_realtime.createSession({
        model: 'mistral-small-latest',
      }),
    ).rejects.toBeInstanceOf(APICallError);
  });

  it.each(['', '.', '..'])(
    'rejects invalid close session ID %j',
    async sessionId => {
      await expect(
        provider.experimental_realtime.closeSession({ sessionId }),
      ).rejects.toThrow('valid session ID');
      expect(server.calls).toHaveLength(0);
    },
  );
});

describe('Mistral realtime configuration', () => {
  it.each<RealtimeModelV4SessionConfig>([
    { inputAudioFormat: { type: 'audio/pcm', rate: 16000 } },
    { outputAudioFormat: { type: 'audio/pcm', rate: 24000 } },
    { inputAudioTranscription: { prompt: 'Vocabulary' } },
    { outputAudioTranscription: { model: 'other' } },
    { outputModalities: ['text'] },
    { turnDetection: null },
    { turnDetection: { type: 'server-vad' } },
  ])('rejects unsupported normalized settings: %j', async config => {
    await expect(
      buildMistralRealtimeSessionConfig(config),
    ).rejects.toBeInstanceOf(UnsupportedFunctionalityError);
  });

  it.each([
    { stt: { targetStreamingDelayMs: 79 } },
    { stt: { turnDetection: { endThreshold: 2 } } },
    { tts: { expressiveness: 2 } },
    { agentVersion: 2 },
  ])('rejects invalid or unavailable provider settings: %j', async mistral => {
    await expect(
      buildMistralRealtimeSessionConfig({ providerOptions: { mistral } }),
    ).rejects.toThrow();
  });

  it('supports instructions, tools and turn settings in live updates', async () => {
    expect(
      await buildMistralRealtimeSessionConfig(
        {
          instructions: 'Updated instructions',
          tools: [],
          providerOptions: { mistral: { turn: { allowInterruptions: true } } },
        },
        { update: true },
      ),
    ).toEqual({
      instructions: 'Updated instructions',
      tools: [],
      turn: { allow_interruptions: true },
    });
  });

  it.each<RealtimeModelV4SessionConfig>([
    { voice: 'voice_447' },
    { providerOptions: { mistral: { stt: { language: 'en' } } } },
    { providerOptions: { mistral: { agentId: 'saved-agent' } } },
  ])('rejects settings that cannot be updated live: %j', async config => {
    await expect(
      buildMistralRealtimeSessionConfig(config, { update: true }),
    ).rejects.toBeInstanceOf(UnsupportedFunctionalityError);
  });
});
