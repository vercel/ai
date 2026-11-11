import { UnsupportedFunctionalityError } from '@ai-sdk/provider';
import {
  convertArrayToReadableStream,
  convertReadableStreamToArray,
} from '@ai-sdk/provider-utils/test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDeepgram } from './deepgram-provider';

class MockWebSocket {
  static instances: MockWebSocket[] = [];
  readyState = 0;
  bufferedAmount = 0;
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
const model = (modelId = 'flux-general-en') =>
  createDeepgram({
    apiKey: 'test-key',
    webSocket: MockWebSocket,
  }).transcription(modelId);
// One second of 16 kHz, 16-bit mono PCM, partly base64-encoded.
const audio = () =>
  convertArrayToReadableStream([
    new Uint8Array(31998),
    'AwQ=',
    new Uint8Array(),
  ]);
const inputAudioFormat = { type: 'audio/pcm', rate: 16000 };
const turnInfo = (
  event: string,
  transcript: string,
  overrides: Record<string, unknown> = {},
) => ({
  type: 'TurnInfo',
  request_id: 'request-id',
  sequence_id: 1,
  event,
  turn_index: 0,
  audio_window_start: 0,
  audio_window_end: 1.5,
  transcript,
  words: transcript
    .split(' ')
    .filter(word => word.length > 0)
    .map((word, index) => ({
      word,
      confidence: 0.9,
      start: index * 0.5,
      end: index * 0.5 + 0.4,
    })),
  end_of_turn_confidence: 0.1,
  ...overrides,
});

describe('Deepgram Flux streaming transcription', () => {
  beforeEach(() => {
    MockWebSocket.instances = [];
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('uses the /v2/listen endpoint, auth subprotocols, and Flux options', async () => {
    const result = await model('flux-general-multi').doStream!({
      audio: audio(),
      inputAudioFormat,
      headers: { 'X-Request': 'request' },
      providerOptions: {
        deepgram: {
          keyterm: 'AI SDK',
          redact: ['numbers', 'aggressive_numbers'],
          streaming: {
            eotThreshold: 0.8,
            eagerEotThreshold: 0.5,
            eotTimeoutMs: 3000,
            languageHints: ['en', 'es'],
          },
        },
      },
    });
    const socket = MockWebSocket.instances[0];
    const url = new URL(socket.url);
    expect(url.origin + url.pathname).toBe('wss://api.deepgram.com/v2/listen');
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      model: 'flux-general-multi',
      encoding: 'linear16',
      sample_rate: '16000',
      keyterm: 'AI SDK',
      eot_threshold: '0.8',
      eager_eot_threshold: '0.5',
      eot_timeout_ms: '3000',
    });
    expect(url.searchParams.getAll('redact')).toEqual([
      'numbers',
      'aggressive_numbers',
    ]);
    expect(url.searchParams.getAll('language_hint')).toEqual(['en', 'es']);
    expect(socket.protocols).toEqual(['token', 'test-key']);
    expect(socket.options?.headers).toMatchObject({
      authorization: 'Token test-key',
      'x-request': 'request',
    });
    expect(result.request?.body).not.toContain('test-key');
    await result.stream.cancel();
    expect(socket.close).toHaveBeenCalled();
  });

  it('uses the language option as a single language hint for flux-general-multi', async () => {
    const result = await model('flux-general-multi').doStream!({
      audio: audio(),
      inputAudioFormat,
      providerOptions: { deepgram: { language: 'es' } },
    });
    const url = new URL(MockWebSocket.instances[0].url);
    expect(url.searchParams.getAll('language_hint')).toEqual(['es']);
    expect(url.searchParams.has('language')).toBe(false);
    await result.stream.cancel();
  });

  it('warns about language hints, Nova-only and batch-only options instead of sending them', async () => {
    const result = await model('flux-general-en').doStream!({
      audio: audio(),
      inputAudioFormat,
      providerOptions: {
        deepgram: {
          smartFormat: true,
          diarize: false,
          streaming: { interimResults: true, languageHints: ['es'] },
        },
      },
    });
    const parts = convertReadableStreamToArray(result.stream);
    const socket = MockWebSocket.instances[0];
    expect([...new URL(socket.url).searchParams.keys()]).toEqual([
      'model',
      'encoding',
      'sample_rate',
    ]);
    socket.open();
    await flush();
    socket.serverClose(1005);
    expect((await parts)[0]).toEqual({
      type: 'stream-start',
      warnings: [
        expect.objectContaining({
          type: 'unsupported',
          feature: 'providerOptions.deepgram.smartFormat',
        }),
        expect.objectContaining({
          type: 'unsupported',
          feature: 'providerOptions.deepgram.streaming.interimResults',
        }),
        expect.objectContaining({
          type: 'unsupported',
          feature: 'providerOptions.deepgram.streaming.languageHints',
        }),
      ],
    });
  });

  it('sends audio, then CloseStream, and never a KeepAlive', async () => {
    vi.useFakeTimers();
    const result = await model().doStream!({
      audio: new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new Uint8Array([1, 2]));
        },
      }),
      inputAudioFormat,
    });
    const socket = MockWebSocket.instances[0];
    socket.open();
    await vi.advanceTimersByTimeAsync(30000);
    expect(socket.send.mock.calls.map(([value]) => value)).toEqual([
      new Uint8Array([1, 2]),
    ]);
    await result.stream.cancel();
  });

  it('maps turn events to partial and final transcripts with turn metadata', async () => {
    const result = await model('flux-general-multi').doStream!({
      audio: audio(),
      inputAudioFormat,
      includeRawChunks: true,
    });
    const parts = convertReadableStreamToArray(result.stream);
    const socket = MockWebSocket.instances[0];
    socket.open();
    await flush();
    expect(socket.send.mock.calls.at(-1)).toEqual([
      JSON.stringify({ type: 'CloseStream' }),
    ]);
    const connected = {
      type: 'Connected',
      request_id: 'request-id',
      sequence_id: 0,
    };
    const endOfTurn = turnInfo('EndOfTurn', 'Hola mundo', {
      end_of_turn_confidence: 0.9,
      trigger: 'model',
      languages: ['es'],
    });
    socket.message(connected);
    socket.message(turnInfo('StartOfTurn', 'Hola', { languages: ['es'] }));
    socket.message(endOfTurn);
    socket.serverClose(1005);
    const values = await parts;

    expect(values).toContainEqual({
      type: 'response-metadata',
      timestamp: expect.any(Date),
      modelId: 'flux-general-multi',
      body: connected,
    });
    expect(values).toContainEqual({ type: 'raw', rawValue: endOfTurn });
    expect(values).toContainEqual({
      type: 'transcript-partial',
      text: 'Hola',
      startSecond: 0,
      durationInSeconds: 1.5,
      providerMetadata: {
        deepgram: {
          event: 'StartOfTurn',
          turnIndex: 0,
          endOfTurnConfidence: 0.1,
          languages: ['es'],
        },
      },
    });
    expect(values).toContainEqual({
      type: 'transcript-final',
      text: 'Hola mundo',
      startSecond: 0,
      endSecond: 1.5,
      providerMetadata: {
        deepgram: {
          event: 'EndOfTurn',
          turnIndex: 0,
          endOfTurnConfidence: 0.9,
          trigger: 'model',
          languages: ['es'],
        },
      },
    });
    expect(values.at(-1)).toEqual({
      type: 'finish',
      text: 'Hola mundo',
      segments: [
        { text: 'Hola', startSecond: 0, endSecond: 0.4 },
        { text: 'mundo', startSecond: 0.5, endSecond: 0.9 },
      ],
      language: 'es',
      durationInSeconds: 1,
    });
    expect(socket.close).toHaveBeenCalledWith(1000);
  });

  it('finishes on a close without a status code and treats the last update of the open turn as final', async () => {
    const result = await model().doStream!({
      audio: audio(),
      inputAudioFormat,
    });
    const parts = convertReadableStreamToArray(result.stream);
    const socket = MockWebSocket.instances[0];
    socket.open();
    await flush();
    socket.message(turnInfo('EndOfTurn', 'First turn.'));
    socket.message(turnInfo('StartOfTurn', 'Second', { turn_index: 1 }));
    socket.message(turnInfo('Update', 'Second turn', { turn_index: 1 }));
    socket.serverClose(1005);
    const values = await parts;

    expect(
      values
        .filter(part => part.type === 'transcript-final')
        .map(part => part.text),
    ).toEqual(['First turn.', 'Second turn']);
    const finish = values.at(-1);
    expect(finish).toMatchObject({
      type: 'finish',
      text: 'First turn. Second turn',
      language: 'en',
      durationInSeconds: 1,
    });
    // Flux reports no usage summary.
    expect(finish).not.toHaveProperty('usage');
  });

  it.each([
    [
      'a fatal error event',
      (socket: MockWebSocket) =>
        socket.message({
          type: 'Error',
          sequence_id: 1,
          code: 'INVALID_PARAMETER',
          description: 'language_hint is not supported',
        }),
      'language_hint is not supported',
    ],
    [
      'an abnormal close code',
      (socket: MockWebSocket) => socket.serverClose(1011, 'server error'),
      'closed unexpectedly (1011): server error',
    ],
  ])('errors the stream on %s', async (_name, trigger, message) => {
    const result = await model().doStream!({
      audio: audio(),
      inputAudioFormat,
    });
    const parts = convertReadableStreamToArray(result.stream);
    const socket = MockWebSocket.instances[0];
    socket.open();
    await flush();
    trigger(socket);
    await expect(parts).rejects.toThrow(message);
    expect(socket.close).toHaveBeenCalled();
  });

  it('errors the stream when the server closes before the audio input ends', async () => {
    const result = await model().doStream!({
      audio: new ReadableStream(),
      inputAudioFormat,
    });
    const parts = convertReadableStreamToArray(result.stream);
    const socket = MockWebSocket.instances[0];
    socket.open();
    await flush();
    socket.serverClose(1005);
    await expect(parts).rejects.toThrow('closed unexpectedly (1005)');
  });

  it('rejects unsupported input formats', async () => {
    await expect(
      model().doStream!({
        audio: audio(),
        inputAudioFormat: { type: 'audio/mp3', rate: 16000 },
      }),
    ).rejects.toThrow('Deepgram streaming requires');
    expect(MockWebSocket.instances).toHaveLength(0);
  });

  it('rejects non-streaming transcription because Flux is streaming-only', async () => {
    const error = await Promise.resolve(
      model('flux-general-multi').doGenerate({
        audio: new Uint8Array([1]),
        mediaType: 'audio/wav',
      }),
    ).catch((error: unknown) => error);
    expect(UnsupportedFunctionalityError.isInstance(error)).toBe(true);
    expect((error as Error).message).toContain('experimental_streamTranscribe');
  });
});
