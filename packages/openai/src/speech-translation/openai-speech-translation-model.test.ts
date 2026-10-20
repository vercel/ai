import fs from 'node:fs';

import {
  convertArrayToReadableStream,
  convertReadableStreamToArray,
} from '@ai-sdk/provider-utils/test';
import { describe, it, expect, vi } from 'vitest';
import { createOpenAI } from '../openai-provider';
import { OpenAISpeechTranslationModel } from './openai-speech-translation-model';

vi.mock('../version', () => ({
  VERSION: '0.0.0-test',
}));

class MockWebSocket {
  static instances: MockWebSocket[] = [];

  readyState = 0;
  send = vi.fn();
  close = vi.fn(() => {
    this.readyState = 3;
  });
  onopen: ((event: unknown) => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  onclose: ((event: unknown) => void) | null = null;

  constructor(
    public url: string | URL,
    public protocols?: string | string[],
    public options?: { headers?: Record<string, string | undefined> },
  ) {
    MockWebSocket.instances.push(this);
  }

  open() {
    this.readyState = 1;
    this.onopen?.({});
  }

  message(value: unknown) {
    this.onmessage?.({ data: JSON.stringify(value) });
  }

  serverClose(code?: number, reason?: string) {
    this.readyState = 3;
    this.onclose?.({ code, reason });
  }
}

const flush = () => new Promise(resolve => setTimeout(resolve, 0));

function readFixture(filename: string) {
  return fs
    .readFileSync(`src/speech-translation/__fixtures__/${filename}`, 'utf8')
    .split('\n')
    .filter(line => line.trim().length > 0)
    .map(line => JSON.parse(line));
}

function createModel(
  overrides: Partial<{
    headers: () => Record<string, string | undefined>;
    currentDate: () => Date;
  }> = {},
) {
  return new OpenAISpeechTranslationModel('gpt-realtime-translate', {
    provider: 'test-provider',
    url: ({ path }) => `https://api.openai.com/v1${path}`,
    headers:
      overrides.headers ?? (() => ({ Authorization: 'Bearer test-api-key' })),
    webSocket: MockWebSocket,
    ...(overrides.currentDate != null
      ? { _internal: { currentDate: overrides.currentDate } }
      : {}),
  });
}

describe('doStream', () => {
  it('should stream gpt-realtime-translate using the OpenAI realtime translations WebSocket', async () => {
    MockWebSocket.instances = [];
    const testDate = new Date(0);
    const model = createModel({ currentDate: () => testDate });

    const result = await model.doStream({
      audio: convertArrayToReadableStream([new Uint8Array([1, 2, 3])]),
      inputAudioFormat: { type: 'audio/pcm', rate: 24000 },
      targetLanguage: 'es',
    });

    const partsPromise = convertReadableStreamToArray(result.stream);
    const ws = MockWebSocket.instances[0];
    expect(ws.url.toString()).toBe(
      'wss://api.openai.com/v1/realtime/translations?model=gpt-realtime-translate',
    );
    expect(ws.protocols).toEqual([
      'realtime',
      'openai-insecure-api-key.test-api-key',
    ]);
    // OpenAI rejects handshakes that send both auth channels:
    expect(Object.keys(ws.options?.headers ?? {})).not.toContain(
      'Authorization',
    );
    expect(Object.keys(ws.options?.headers ?? {})).not.toContain(
      'authorization',
    );

    ws.open();
    await flush();

    expect(JSON.parse(ws.send.mock.calls[0][0])).toEqual({
      type: 'session.update',
      session: {
        audio: {
          input: {
            transcription: {
              model: 'gpt-realtime-whisper',
            },
            noise_reduction: null,
          },
          output: {
            language: 'es',
          },
        },
      },
    });
    expect(JSON.parse(ws.send.mock.calls[1][0])).toEqual({
      type: 'session.input_audio_buffer.append',
      audio: 'AQID',
    });
    expect(JSON.parse(ws.send.mock.calls[2][0])).toEqual({
      type: 'session.close',
    });

    ws.message({
      type: 'session.input_transcript.delta',
      event_id: 'event-1',
      delta: 'Hello',
    });
    ws.message({
      type: 'session.output_transcript.delta',
      event_id: 'event-2',
      delta: 'Hola',
    });
    ws.message({
      type: 'session.output_audio.delta',
      event_id: 'event-3',
      delta: 'BAUG',
    });
    ws.message({ type: 'session.closed', event_id: 'event-4' });

    await expect(partsPromise).resolves.toEqual([
      { type: 'stream-start', warnings: [] },
      { type: 'source-transcript-delta', delta: 'Hello' },
      { type: 'output-text-delta', delta: 'Hola' },
      { type: 'audio', audio: 'BAUG' },
      { type: 'source-transcript-final', text: 'Hello' },
      { type: 'output-text-final', text: 'Hola' },
      {
        type: 'finish',
        sourceText: 'Hello',
        outputText: 'Hola',
        usage: undefined,
      },
    ]);
    expect(result.response).toEqual({
      timestamp: testDate,
      modelId: 'gpt-realtime-translate',
    });
    expect(result.request).toEqual({
      body: JSON.parse(ws.send.mock.calls[0][0]),
    });
  });

  it('should accumulate transcript deltas until the session closes', async () => {
    MockWebSocket.instances = [];
    const model = createModel();

    const result = await model.doStream({
      audio: convertArrayToReadableStream([new Uint8Array([1, 2, 3])]),
      inputAudioFormat: { type: 'audio/pcm', rate: 24000 },
      targetLanguage: 'es',
    });

    const partsPromise = convertReadableStreamToArray(result.stream);
    const ws = MockWebSocket.instances[0];
    ws.open();
    await flush();

    ws.message({
      type: 'session.input_transcript.delta',
      event_id: 'event-1',
      delta: 'Hello ',
    });
    ws.message({
      type: 'session.input_transcript.delta',
      event_id: 'event-2',
      delta: 'world',
    });
    ws.message({
      type: 'session.output_transcript.delta',
      event_id: 'event-3',
      delta: 'Hola ',
    });
    ws.message({
      type: 'session.output_transcript.delta',
      event_id: 'event-4',
      delta: 'mundo',
    });
    ws.message({ type: 'session.closed', event_id: 'event-5' });

    const parts = await partsPromise;
    expect(parts.at(-1)).toEqual({
      type: 'finish',
      sourceText: 'Hello world',
      outputText: 'Hola mundo',
      usage: undefined,
    });
  });

  it('should parse a real OpenAI Realtime translation response', async () => {
    MockWebSocket.instances = [];
    const model = createModel();

    const result = await model.doStream({
      audio: convertArrayToReadableStream([new Uint8Array([1, 2, 3])]),
      inputAudioFormat: { type: 'audio/pcm', rate: 24000 },
      targetLanguage: 'es',
    });

    const partsPromise = convertReadableStreamToArray(result.stream);
    const ws = MockWebSocket.instances[0];
    ws.open();
    await flush();

    for (const message of readFixture(
      'openai-realtime-speech-translation.chunks.txt',
    )) {
      ws.message(message);
    }

    const parts = await partsPromise;
    expect(parts.filter(part => part.type === 'audio')).toEqual([
      { type: 'audio', audio: 'AQID' },
    ]);
    expect(parts.at(-3)).toEqual({
      type: 'source-transcript-final',
      text: ' The quick brown fox jumps over the lazy',
    });
    expect(parts.at(-2)).toEqual({
      type: 'output-text-final',
      text: 'La rápida zorra marrón salta sobre el perro perezoso.',
    });
    expect(parts.at(-1)).toEqual({
      type: 'finish',
      sourceText: ' The quick brown fox jumps over the lazy',
      outputText: 'La rápida zorra marrón salta sobre el perro perezoso.',
      usage: undefined,
    });
  });

  it('should warn about unsupported sourceLanguage and outputAudioFormat', async () => {
    MockWebSocket.instances = [];
    const model = createModel();

    const result = await model.doStream({
      audio: convertArrayToReadableStream([new Uint8Array([1, 2, 3])]),
      inputAudioFormat: { type: 'audio/pcm', rate: 24000 },
      targetLanguage: 'es',
      sourceLanguage: 'en',
      outputAudioFormat: { type: 'audio/pcm', rate: 24000 },
    });

    const partsPromise = convertReadableStreamToArray(result.stream);
    const ws = MockWebSocket.instances[0];
    ws.open();
    await flush();

    expect(JSON.parse(ws.send.mock.calls[0][0])).toEqual({
      type: 'session.update',
      session: {
        audio: {
          input: {
            transcription: {
              model: 'gpt-realtime-whisper',
            },
            noise_reduction: null,
          },
          output: {
            language: 'es',
          },
        },
      },
    });

    ws.message({
      type: 'session.output_transcript.delta',
      event_id: 'event-1',
      delta: 'Hola',
    });
    ws.message({ type: 'session.closed', event_id: 'event-2' });
    const parts = await partsPromise;
    expect(parts[0]).toEqual({
      type: 'stream-start',
      warnings: [
        {
          type: 'unsupported',
          feature: 'sourceLanguage',
          details:
            'The OpenAI Realtime translation API auto-detects the source language and does not accept a source language.',
        },
        {
          type: 'unsupported',
          feature: 'outputAudioFormat',
          details:
            'The OpenAI Realtime translation API always outputs 24kHz 16-bit PCM audio and does not accept an output audio format.',
        },
      ],
    });
  });

  it('should include raw provider chunks when includeRawChunks is enabled', async () => {
    MockWebSocket.instances = [];
    const model = createModel();

    const result = await model.doStream({
      audio: convertArrayToReadableStream([new Uint8Array([1, 2, 3])]),
      inputAudioFormat: { type: 'audio/pcm', rate: 24000 },
      targetLanguage: 'es',
      includeRawChunks: true,
    });

    const partsPromise = convertReadableStreamToArray(result.stream);
    const ws = MockWebSocket.instances[0];
    ws.open();
    await flush();

    ws.message({ type: 'session.updated' });
    ws.message({
      type: 'session.output_transcript.delta',
      event_id: 'event-1',
      delta: 'Hola',
    });
    ws.message({ type: 'session.closed', event_id: 'event-2' });

    const parts = await partsPromise;
    expect(parts.filter(part => part.type === 'raw')).toEqual([
      { type: 'raw', rawValue: { type: 'session.updated' } },
      {
        type: 'raw',
        rawValue: {
          type: 'session.output_transcript.delta',
          event_id: 'event-1',
          delta: 'Hola',
        },
      },
      {
        type: 'raw',
        rawValue: { type: 'session.closed', event_id: 'event-2' },
      },
    ]);
  });

  it('should strip only the Authorization header and pass other headers to the WebSocket constructor', async () => {
    MockWebSocket.instances = [];
    const model = createModel({
      headers: () => ({
        Authorization: 'Bearer test-api-key',
        'OpenAI-Organization': 'test-organization',
        'Custom-Header': 'custom-value',
      }),
    });

    const result = await model.doStream({
      audio: convertArrayToReadableStream([new Uint8Array([1, 2, 3])]),
      inputAudioFormat: { type: 'audio/pcm', rate: 24000 },
      targetLanguage: 'es',
    });

    const partsPromise = convertReadableStreamToArray(result.stream);
    const ws = MockWebSocket.instances[0];

    expect(ws.protocols).toEqual([
      'realtime',
      'openai-insecure-api-key.test-api-key',
    ]);
    expect(ws.options?.headers).toMatchObject({
      'OpenAI-Organization': 'test-organization',
      'Custom-Header': 'custom-value',
    });
    expect(Object.keys(ws.options?.headers ?? {})).not.toContain(
      'Authorization',
    );
    expect(Object.keys(ws.options?.headers ?? {})).not.toContain(
      'authorization',
    );

    ws.open();
    await flush();
    ws.message({
      type: 'session.output_transcript.delta',
      event_id: 'event-1',
      delta: 'Hola',
    });
    ws.message({ type: 'session.closed', event_id: 'event-2' });
    await expect(partsPromise).resolves.toBeDefined();
  });

  it('should use only the realtime protocol and pass headers unchanged when there is no Authorization header', async () => {
    MockWebSocket.instances = [];
    const model = createModel({
      headers: () => ({ 'Custom-Header': 'custom-value' }),
    });

    const result = await model.doStream({
      audio: convertArrayToReadableStream([new Uint8Array([1, 2, 3])]),
      inputAudioFormat: { type: 'audio/pcm', rate: 24000 },
      targetLanguage: 'es',
    });

    void result.stream.cancel();
    const ws = MockWebSocket.instances[0];
    expect(ws.protocols).toEqual(['realtime']);
    expect(ws.options?.headers).toMatchObject({
      'Custom-Header': 'custom-value',
    });
  });

  it('should cancel the audio stream when the WebSocket constructor throws', async () => {
    let audioCancelled = false;
    const audio = new ReadableStream<Uint8Array>({
      cancel() {
        audioCancelled = true;
      },
    });
    const model = new OpenAISpeechTranslationModel('gpt-realtime-translate', {
      provider: 'test-provider',
      url: ({ path }) => `https://api.openai.com/v1${path}`,
      headers: () => ({ Authorization: 'Bearer test-api-key' }),
      webSocket: class {
        constructor() {
          throw new Error('constructor failed');
        }
      } as never,
    });

    const result = await model.doStream({
      audio,
      inputAudioFormat: { type: 'audio/pcm', rate: 24000 },
      targetLanguage: 'es',
    });

    await expect(convertReadableStreamToArray(result.stream)).rejects.toThrow(
      'constructor failed',
    );
    expect(audioCancelled).toBe(true);
  });

  it('should emit recoverable server errors and continue streaming', async () => {
    MockWebSocket.instances = [];
    const model = createModel();

    const result = await model.doStream({
      audio: convertArrayToReadableStream([new Uint8Array([1, 2, 3])]),
      inputAudioFormat: { type: 'audio/pcm', rate: 24000 },
      targetLanguage: 'es',
    });

    const partsPromise = convertReadableStreamToArray(result.stream);
    const ws = MockWebSocket.instances[0];
    ws.open();
    await flush();

    ws.message({
      type: 'error',
      error: { message: 'invalid target language' },
    });
    ws.message({
      type: 'session.output_transcript.delta',
      event_id: 'event-1',
      delta: 'Hola',
    });
    ws.message({ type: 'session.closed', event_id: 'event-2' });

    const parts = await partsPromise;
    expect(parts.find(part => part.type === 'error')).toEqual({
      type: 'error',
      error: expect.objectContaining({ message: 'invalid target language' }),
    });
    expect(parts.at(-1)).toEqual({
      type: 'finish',
      sourceText: '',
      outputText: 'Hola',
      usage: undefined,
    });
  });

  it('should close the WebSocket and stop reading audio when the stream is cancelled', async () => {
    MockWebSocket.instances = [];
    let audioCancelled = false;
    const audio = new ReadableStream<Uint8Array>({
      cancel() {
        audioCancelled = true;
      },
    });
    const model = createModel();

    const result = await model.doStream({
      audio,
      inputAudioFormat: { type: 'audio/pcm', rate: 24000 },
      targetLanguage: 'es',
    });

    const ws = MockWebSocket.instances[0];
    ws.open();
    await flush();

    await result.stream.cancel();
    await flush();

    expect(ws.close).toHaveBeenCalled();
    expect(audioCancelled).toBe(true);
  });

  it('should be created by the provider translation factory with realtime auth', async () => {
    MockWebSocket.instances = [];
    const provider = createOpenAI({
      apiKey: 'test-api-key',
      webSocket: MockWebSocket,
    });

    const model = provider.translation('gpt-realtime-translate');
    expect(model.provider).toBe('openai.speech-translation');
    expect(model.modelId).toBe('gpt-realtime-translate');

    const result = await model.doStream({
      audio: convertArrayToReadableStream([new Uint8Array([1, 2, 3])]),
      inputAudioFormat: { type: 'audio/pcm', rate: 24000 },
      targetLanguage: 'es',
    });

    void result.stream.cancel();
    const ws = MockWebSocket.instances[0];
    expect(ws.protocols).toEqual([
      'realtime',
      'openai-insecure-api-key.test-api-key',
    ]);
  });

  it('should reject unsupported input audio types', async () => {
    const model = createModel();

    await expect(
      model.doStream({
        audio: convertArrayToReadableStream([new Uint8Array([1, 2, 3])]),
        inputAudioFormat: { type: 'audio/pcmu', rate: 24000 },
        targetLanguage: 'es',
      }),
    ).rejects.toThrow(
      'The OpenAI Realtime translation API only supports 24kHz 16-bit PCM input audio.',
    );
  });

  it('should reject unsupported input audio sample rates', async () => {
    const model = createModel();

    await expect(
      model.doStream({
        audio: convertArrayToReadableStream([new Uint8Array([1, 2, 3])]),
        inputAudioFormat: { type: 'audio/pcm', rate: 16000 },
        targetLanguage: 'es',
      }),
    ).rejects.toThrow(
      'The OpenAI Realtime translation API only supports 24kHz 16-bit PCM input audio.',
    );
  });

  it('should skip empty output audio deltas', async () => {
    MockWebSocket.instances = [];
    const model = createModel();

    const result = await model.doStream({
      audio: convertArrayToReadableStream([new Uint8Array([1, 2, 3])]),
      inputAudioFormat: { type: 'audio/pcm', rate: 24000 },
      targetLanguage: 'es',
    });

    const partsPromise = convertReadableStreamToArray(result.stream);
    const ws = MockWebSocket.instances[0];
    ws.open();
    await flush();

    ws.message({
      type: 'session.output_audio.delta',
      event_id: 'event-1',
      delta: '',
    });
    ws.message({
      type: 'session.output_audio.delta',
      event_id: 'event-2',
      delta: 'BAUG',
    });
    ws.message({
      type: 'session.output_transcript.delta',
      event_id: 'event-3',
      delta: 'Hola',
    });
    ws.message({ type: 'session.closed', event_id: 'event-4' });

    const parts = await partsPromise;
    expect(parts.filter(part => part.type === 'audio')).toEqual([
      { type: 'audio', audio: 'BAUG' },
    ]);
  });

  it('should error the stream with close diagnostics when the socket closes before finishing', async () => {
    MockWebSocket.instances = [];
    const model = createModel();

    const result = await model.doStream({
      audio: convertArrayToReadableStream([new Uint8Array([1, 2, 3])]),
      inputAudioFormat: { type: 'audio/pcm', rate: 24000 },
      targetLanguage: 'es',
    });

    const partsPromise = convertReadableStreamToArray(result.stream);
    const ws = MockWebSocket.instances[0];
    ws.open();
    await flush();

    ws.message({
      type: 'session.output_transcript.delta',
      event_id: 'event-1',
      delta: 'Ho',
    });
    ws.serverClose(1011, 'internal server error');

    await expect(partsPromise).rejects.toThrow(
      'OpenAI realtime translation WebSocket closed unexpectedly before finishing (code 1011, reason: internal server error).',
    );
  });

  it('should error the stream when the abort signal fires mid-stream', async () => {
    MockWebSocket.instances = [];
    const model = createModel();
    const abortController = new AbortController();

    const result = await model.doStream({
      audio: convertArrayToReadableStream([new Uint8Array([1, 2, 3])]),
      inputAudioFormat: { type: 'audio/pcm', rate: 24000 },
      targetLanguage: 'es',
      abortSignal: abortController.signal,
    });

    const partsPromise = convertReadableStreamToArray(result.stream);
    const ws = MockWebSocket.instances[0];
    ws.open();
    await flush();

    ws.message({
      type: 'session.output_transcript.delta',
      event_id: 'event-1',
      delta: 'Ho',
    });
    await flush();

    abortController.abort(new Error('user aborted'));

    await expect(partsPromise).rejects.toThrow('user aborted');
    expect(ws.close).toHaveBeenCalled();
  });

  it('should ignore server messages after the stream finished', async () => {
    MockWebSocket.instances = [];
    const model = createModel();

    const result = await model.doStream({
      audio: convertArrayToReadableStream([new Uint8Array([1, 2, 3])]),
      inputAudioFormat: { type: 'audio/pcm', rate: 24000 },
      targetLanguage: 'es',
    });

    const partsPromise = convertReadableStreamToArray(result.stream);
    const ws = MockWebSocket.instances[0];
    ws.open();
    await flush();

    ws.message({
      type: 'session.output_transcript.delta',
      event_id: 'event-1',
      delta: 'Hola',
    });
    ws.message({ type: 'session.closed', event_id: 'event-2' });

    const parts = await partsPromise;
    expect(parts.at(-1)?.type).toBe('finish');

    // post-finish messages are a no-op (no throw, no new parts):
    ws.message({
      type: 'session.output_transcript.delta',
      event_id: 'event-3',
      delta: 'late',
    });
    ws.message({ type: 'session.closed', event_id: 'event-4' });
    await flush();
    expect(parts).toHaveLength(4);
  });
});
