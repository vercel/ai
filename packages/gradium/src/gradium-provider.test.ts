import {
  APICallError,
  LoadAPIKeyError,
  NoSuchModelError,
  UnsupportedFunctionalityError,
} from '@ai-sdk/provider';
import {
  WORKFLOW_SERIALIZE,
  WORKFLOW_DESERIALIZE,
} from '@ai-sdk/provider-utils';
import type { WebSocketFactory, WebSocketLike } from '@gradium/sdk';
import { generateSpeech, transcribe, createProviderRegistry } from 'ai';
import { describe, expect, it, vi } from 'vitest';
import { createGradium, gradium } from './gradium-provider';
import { GradiumSpeechModel } from './gradium-speech-model';
import { GradiumTranscriptionModel } from './gradium-transcription-model';

function transport(
  messages: unknown[],
  { stall = false, connecting = false } = {},
) {
  const sent: Record<string, unknown>[] = [];
  const socket: WebSocketLike = {
    readyState: connecting ? 0 : 1,
    onopen: null,
    onmessage: null,
    onerror: null,
    onclose: null,
    send(data) {
      const message = JSON.parse(data);
      sent.push(message);
      if (message.type === 'setup')
        queueMicrotask(() =>
          socket.onmessage?.({
            data: JSON.stringify({
              type: 'ready',
              request_id: 'request-1',
              sample_rate: 48000,
            }),
          }),
        );
      if (message.type === 'end_of_stream' && !stall) {
        queueMicrotask(() => {
          for (const message of messages)
            socket.onmessage?.({ data: JSON.stringify(message) });
          // Deliberately keep the socket open after EOS to verify cleanup.
          socket.onmessage?.({
            data: JSON.stringify({ type: 'end_of_stream' }),
          });
        });
      }
    },
    close: vi.fn(() => {
      socket.readyState = 3;
      socket.onclose?.({ code: 1000 });
    }),
  };
  const factory = vi.fn<WebSocketFactory>(() => socket);
  return { socket, factory, sent };
}

describe('Gradium provider', () => {
  it('creates models without requiring credentials and supports registry aliases', () => {
    expect(gradium.speech().specificationVersion).toBe('v4');
    expect(gradium().transcription.modelId).toBe('default');
    const registry = createProviderRegistry({ gradium });
    expect(registry.speechModel('gradium:default').provider).toBe(
      'gradium.speech',
    );
    expect(registry.transcriptionModel('gradium:stt-translate').modelId).toBe(
      'stt-translate',
    );
    expect(() => gradium.languageModel('default')).toThrow(NoSuchModelError);
    expect(() => gradium.embeddingModel('default')).toThrow(NoSuchModelError);
    expect(() => gradium.imageModel('default')).toThrow(NoSuchModelError);
  });

  it('generates speech through AI SDK and the real Gradium SDK protocol', async () => {
    const mock = transport([
      { type: 'audio', audio: 'UklGRg==' },
      { type: 'audio', audio: 'AQI=' },
      { type: 'text', text: 'Hello', start_s: 0.1, stop_s: 0.7 },
    ]);
    const provider = createGradium({
      apiKey: 'test-key',
      baseURL: 'https://example.com/api',
      webSocketFactory: mock.factory,
    });
    const result = await generateSpeech({
      model: provider.speech('custom-tts'),
      text: 'Hello',
      voice: 'voice-id',
      outputFormat: 'wav',
      providerOptions: {
        gradium: {
          voiceId: 'ignored',
          pronunciationId: 'dictionary',
          jsonConfig: { padding_bonus: 0 },
          clientRequestId: 'client-1',
        },
      },
    });
    expect(result.audio.uint8Array).toEqual(
      new Uint8Array([82, 73, 70, 70, 1, 2]),
    );
    expect(mock.factory).toHaveBeenCalledWith(
      'wss://example.com/api/speech/tts',
      expect.objectContaining({ 'x-api-key': 'test-key' }),
    );
    expect(mock.sent[0]).toMatchObject({
      type: 'setup',
      model_name: 'custom-tts',
      voice_id: 'voice-id',
      output_format: 'wav',
      pronunciation_id: 'dictionary',
      json_config: '{"padding_bonus":0}',
      client_req_id: 'client-1',
    });
    expect(mock.sent[1]).toEqual({ type: 'text', text: 'Hello' });
    expect(result.providerMetadata?.gradium).toMatchObject({
      requestId: 'request-1',
      sampleRate: 48000,
      textWithTimestamps: [{ text: 'Hello', startSecond: 0.1, endSecond: 0.7 }],
    });
    expect(mock.socket.close).toHaveBeenCalled();
  });

  it('transcribes through AI SDK and preserves segment timestamps', async () => {
    const mock = transport([
      { type: 'text', text: 'Hello', start_s: 0.2, stop_s: 0.8 },
      { type: 'text', text: 'world', start_s: 0.9, stop_s: 1.5 },
    ]);
    const provider = createGradium({
      apiKey: 'test-key',
      webSocketFactory: mock.factory,
    });
    const result = await transcribe({
      model: provider.transcription(),
      audio: new Uint8Array([1, 2]),
      providerOptions: {
        gradium: {
          jsonConfig: { language: 'en' },
          clientRequestId: 'client-2',
        },
      },
    });
    expect(result.text).toBe('Hello world');
    expect(result.segments).toEqual([
      { text: 'Hello', startSecond: 0.2, endSecond: 0.8 },
      { text: 'world', startSecond: 0.9, endSecond: 1.5 },
    ]);
    expect(result.language).toBeUndefined();
    expect(result.durationInSeconds).toBeUndefined();
    expect(mock.sent[0]).toMatchObject({
      model_name: 'default',
      input_format: 'wav',
      json_config: '{"language":"en"}',
      client_req_id: 'client-2',
    });
    expect(mock.sent[1]).toEqual({ type: 'audio', audio: 'AQI=' });
  });

  it('decodes base64 input and allows explicit PCM format', async () => {
    const mock = transport([]);
    const model = createGradium({
      apiKey: 'test',
      webSocketFactory: mock.factory,
    }).transcription('stt-translate');
    await model.doGenerate({
      audio: 'AQI=',
      mediaType: 'application/octet-stream',
      providerOptions: { gradium: { inputFormat: 'pcm' } },
    });
    expect(mock.sent[0]).toMatchObject({
      model_name: 'stt-translate',
      input_format: 'pcm',
    });
    expect(mock.sent[1]).toEqual({ type: 'audio', audio: 'AQI=' });
  });

  it.each([
    'audio/x-wav',
    'audio/wave',
    'audio/vnd.wave',
    'audio/opus',
    'audio/ogg; codecs=opus',
    'audio/pcm',
  ])('maps %s input', async mediaType => {
    const mock = transport([]);
    await createGradium({ apiKey: 'test', webSocketFactory: mock.factory })
      .transcription()
      .doGenerate({ audio: new Uint8Array([0, 0]), mediaType });
    expect(mock.sent[0].input_format).toBe(
      mediaType.includes('opus') || mediaType.includes('ogg')
        ? 'opus'
        : mediaType.includes('pcm')
          ? 'pcm'
          : 'wav',
    );
  });

  it('rejects unsupported formats before connecting', async () => {
    const mock = transport([]);
    const provider = createGradium({
      apiKey: 'test',
      webSocketFactory: mock.factory,
    });
    await expect(
      provider.speech().doGenerate({ text: 'Hello', outputFormat: 'mp3' }),
    ).rejects.toThrow(UnsupportedFunctionalityError);
    await expect(
      provider
        .transcription()
        .doGenerate({ audio: new Uint8Array(), mediaType: 'audio/mpeg' }),
    ).rejects.toThrow(UnsupportedFunctionalityError);
    await expect(
      provider.transcription().doGenerate({
        audio: new Uint8Array(),
        mediaType: 'audio/wav',
        providerOptions: { gradium: { inputFormat: 'mp3' } },
      }),
    ).rejects.toThrow();
    expect(mock.factory).not.toHaveBeenCalled();
  });

  it('reports unsupported settings and forwards named voices', async () => {
    const mock = transport([{ type: 'audio', audio: 'AQI=' }]);
    const result = await createGradium({
      apiKey: 'test',
      webSocketFactory: mock.factory,
    })
      .speech()
      .doGenerate({
        text: 'Hello',
        speed: 1,
        instructions: 'Speak softly',
        language: 'en',
        headers: { 'x-custom': 'value' },
        providerOptions: { gradium: { voice: 'named-voice' } },
      });
    expect(result.warnings).toEqual(
      ['speed', 'language', 'instructions', 'headers'].map(feature => ({
        type: 'unsupported',
        feature,
      })),
    );
    expect(mock.sent[0]).toMatchObject({
      voice: 'named-voice',
      output_format: 'wav',
    });
  });

  it.each([
    [1008, false],
    [1011, true],
  ])('maps WebSocket error %i with retryable=%s', async (code, retryable) => {
    const mock = transport([{ type: 'error', message: 'Server failed', code }]);
    const model = createGradium({
      apiKey: 'test',
      webSocketFactory: mock.factory,
    }).speech();
    const error = await model
      .doGenerate({ text: 'Hello' })
      .catch(error => error);
    expect(error).toBeInstanceOf(APICallError);
    expect(error.isRetryable).toBe(retryable);
    expect(error.url).toBe('wss://api.gradium.ai/api/speech/tts');
    expect(mock.socket.close).toHaveBeenCalled();
  });

  it('rejects malformed messages and closes the socket', async () => {
    const mock = transport([], { stall: true });
    const call = createGradium({
      apiKey: 'test',
      webSocketFactory: mock.factory,
    })
      .speech()
      .doGenerate({ text: 'Hello' });
    await vi.waitFor(() => expect(mock.sent.length).toBe(3));
    mock.socket.onmessage?.({ data: '{broken' });
    await expect(call).rejects.toThrow('Failed to parse server message');
    expect(mock.socket.close).toHaveBeenCalled();
  });

  it('honors already aborted signals without opening a socket', async () => {
    const mock = transport([]);
    const signal = AbortSignal.abort();
    await expect(
      createGradium({ apiKey: 'test', webSocketFactory: mock.factory })
        .speech()
        .doGenerate({ text: 'Hello', abortSignal: signal }),
    ).rejects.toBe(signal.reason);
    expect(mock.factory).not.toHaveBeenCalled();
  });

  it('cancels an active request and closes its socket', async () => {
    const mock = transport([], { stall: true });
    const controller = new AbortController();
    const call = createGradium({
      apiKey: 'test',
      webSocketFactory: mock.factory,
    })
      .speech()
      .doGenerate({ text: 'Hello', abortSignal: controller.signal });
    await vi.waitFor(() => expect(mock.sent.length).toBe(3));
    controller.abort();
    await expect(call).rejects.toBe(controller.signal.reason);
    expect(mock.socket.close).toHaveBeenCalled();
  });

  it('closes a connection that opens after cancellation', async () => {
    const mock = transport([], { connecting: true });
    const controller = new AbortController();
    const call = createGradium({
      apiKey: 'test',
      webSocketFactory: mock.factory,
    })
      .speech()
      .doGenerate({ text: 'Hello', abortSignal: controller.signal });
    await vi.waitFor(() => expect(mock.socket.onopen).not.toBeNull());
    controller.abort();
    await expect(call).rejects.toBe(controller.signal.reason);
    mock.socket.readyState = 1;
    mock.socket.onopen?.({});
    await vi.waitFor(() => expect(mock.socket.close).toHaveBeenCalled());
    expect(mock.sent).toEqual([]);
  });

  it('resolves credentials lazily from the environment', async () => {
    vi.stubEnv('GRADIUM_API_KEY', undefined);
    try {
      const mock = transport([]);
      const provider = createGradium({ webSocketFactory: mock.factory });
      await expect(
        provider.speech().doGenerate({ text: 'Hello' }),
      ).rejects.toThrow(LoadAPIKeyError);
      vi.stubEnv('GRADIUM_API_KEY', 'env-key');
      await provider.speech().doGenerate({ text: 'Hello' });
      expect(mock.factory).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ 'x-api-key': 'env-key' }),
      );
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('serializes both models without credentials or custom transports', () => {
    const mock = transport([]);
    const provider = createGradium({
      apiKey: 'secret',
      token: 'secret-token',
      baseURL: 'https://example.com/api/',
      webSocketFactory: mock.factory,
    });
    const speech = GradiumSpeechModel[WORKFLOW_SERIALIZE](provider.speech());
    const transcription = GradiumTranscriptionModel[WORKFLOW_SERIALIZE](
      provider.transcription(),
    );
    for (const value of [speech, transcription]) {
      expect(value.config).not.toHaveProperty('apiKey');
      expect(value.config).not.toHaveProperty('token');
      expect(value.config).not.toHaveProperty('webSocketFactory');
      expect(value.config.baseURL).toBe('https://example.com/api/');
    }
    expect(
      GradiumSpeechModel[WORKFLOW_DESERIALIZE](
        speech as unknown as Parameters<
          (typeof GradiumSpeechModel)[typeof WORKFLOW_DESERIALIZE]
        >[0],
      ).provider,
    ).toBe('gradium.speech');
    expect(
      GradiumTranscriptionModel[WORKFLOW_DESERIALIZE](
        transcription as unknown as Parameters<
          (typeof GradiumTranscriptionModel)[typeof WORKFLOW_DESERIALIZE]
        >[0],
      ).provider,
    ).toBe('gradium.transcription');
  });
});
