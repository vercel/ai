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
  serverClose(code = 1000) {
    this.readyState = 3;
    this.onclose?.({ code });
  }
}

const flush = () => new Promise(resolve => setTimeout(resolve, 0));
const model = () =>
  createDeepgram({
    apiKey: 'test-key',
    webSocket: MockWebSocket,
  }).transcription('nova-3');
const audio = () =>
  convertArrayToReadableStream([
    new Uint8Array([1, 2]),
    'AwQ=',
    new Uint8Array(),
  ]);
const inputAudioFormat = { type: 'audio/pcm', rate: 16000 };
const results = (text: string, isFinal = true, channel = 0) => ({
  type: 'Results',
  is_final: isFinal,
  speech_final: isFinal,
  start: 0,
  duration: 1.5,
  channel_index: [channel, 2],
  channel: {
    alternatives: [
      {
        transcript: text,
        languages: ['en'],
        words: [
          { word: 'hello', punctuated_word: 'Hello!', start: 0.2, end: 0.8 },
        ],
      },
    ],
  },
});

describe('Deepgram streaming transcription', () => {
  beforeEach(() => {
    MockWebSocket.instances = [];
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('uses the live endpoint, auth subprotocols, headers, and streaming options', async () => {
    const provider = createDeepgram({
      apiKey: async () => 'resolved-key',
      headers: { 'X-Provider': 'provider' },
      webSocket: MockWebSocket,
    });
    const result = await provider.transcription('nova-3').doStream!({
      audio: audio(),
      inputAudioFormat,
      headers: { 'X-Request': 'request' },
      providerOptions: {
        deepgram: {
          language: 'fr',
          redact: ['numbers', 'names'],
          streaming: {
            interimResults: true,
            endpointing: false,
            channels: 2,
            multichannel: true,
            vadEvents: true,
            utteranceEndMs: 1000,
          },
        },
      },
    });
    const socket = MockWebSocket.instances[0];
    const url = new URL(socket.url);
    expect(url.origin + url.pathname).toBe('wss://api.deepgram.com/v1/listen');
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      model: 'nova-3',
      encoding: 'linear16',
      sample_rate: '16000',
      language: 'fr',
      interim_results: 'true',
      endpointing: 'false',
      channels: '2',
      multichannel: 'true',
      vad_events: 'true',
      utterance_end_ms: '1000',
    });
    expect(url.searchParams.getAll('redact')).toEqual(['numbers', 'names']);
    expect(socket.protocols).toEqual(['token', 'resolved-key']);
    expect(socket.options?.headers).toMatchObject({
      authorization: 'Token resolved-key',
      'x-provider': 'provider',
      'X-Request': 'request',
    });
    expect(result.request?.body).not.toContain('resolved-key');
    await result.stream.cancel();
    expect(socket.close).toHaveBeenCalled();
  });

  it('sends binary and base64 audio, skips empty frames, and flushes with CloseStream', async () => {
    const result = await model().doStream!({
      audio: audio(),
      inputAudioFormat,
    });
    const parts = convertReadableStreamToArray(result.stream);
    const socket = MockWebSocket.instances[0];
    socket.open();
    await flush();
    expect(socket.send.mock.calls.map(([value]) => value)).toEqual([
      new Uint8Array([1, 2]),
      new Uint8Array([3, 4]),
      JSON.stringify({ type: 'CloseStream' }),
    ]);
    socket.message({ type: 'Metadata', duration: 2 });
    expect((await parts).at(-1)).toMatchObject({
      type: 'finish',
      text: '',
      durationInSeconds: 2,
      usage: { seconds: 2 },
    });
    expect(socket.close).toHaveBeenCalledWith(1000);
  });

  it.each(['Bearer', 'bearer'])(
    'authenticates temporary tokens using the %s subprotocol',
    async scheme => {
      const result = await model().doStream!({
        audio: audio(),
        inputAudioFormat,
        headers: { authorization: `${scheme} temporary-jwt` },
      });
      expect(MockWebSocket.instances[0].protocols).toEqual([
        'bearer',
        'temporary-jwt',
      ]);
      expect(result.request?.body).not.toContain('temporary-jwt');
      await result.stream.cancel();
    },
  );

  it('rejects unsupported authentication schemes without exposing credentials', async () => {
    await expect(
      model().doStream!({
        audio: audio(),
        inputAudioFormat,
        headers: { authorization: 'Basic secret' },
      }),
    ).rejects.toThrow('must use the Token or Bearer scheme');
    expect(MockWebSocket.instances).toHaveLength(0);
  });

  it('omits undefined headers before resolving the authentication scheme', async () => {
    const result = await model().doStream!({
      audio: audio(),
      inputAudioFormat,
      headers: { authorization: undefined, 'X-Optional': undefined },
    });
    expect(MockWebSocket.instances[0].protocols).toBeUndefined();
    expect(MockWebSocket.instances[0].options?.headers).not.toHaveProperty(
      'authorization',
    );
    expect(MockWebSocket.instances[0].options?.headers).not.toHaveProperty(
      'X-Optional',
    );
    await result.stream.cancel();
  });

  it('maps revisable and final transcripts, word timings, channels, language, raw events and usage', async () => {
    const result = await model().doStream!({
      audio: audio(),
      inputAudioFormat,
      includeRawChunks: true,
    });
    const parts = convertReadableStreamToArray(result.stream);
    const socket = MockWebSocket.instances[0];
    socket.open();
    await flush();
    socket.message(results('Hel', false));
    socket.message(results('Hello!', true, 1));
    socket.message({
      type: 'Metadata',
      duration: 2.5,
      request_id: 'request-id',
    });
    const values = await parts;
    expect(values).toContainEqual({
      type: 'raw',
      rawValue: results('Hello!', true, 1),
    });
    expect(values).toContainEqual({
      type: 'transcript-partial',
      text: 'Hel',
      startSecond: 0,
      durationInSeconds: 1.5,
      channelIndex: 0,
      providerMetadata: { deepgram: { speechFinal: false } },
    });
    expect(values).toContainEqual({
      type: 'transcript-final',
      text: 'Hello!',
      startSecond: 0,
      endSecond: 1.5,
      channelIndex: 1,
      providerMetadata: { deepgram: { speechFinal: true } },
    });
    expect(values.at(-1)).toEqual({
      type: 'finish',
      text: 'Hello!',
      segments: [{ text: 'Hello!', startSecond: 0.2, endSecond: 0.8 }],
      language: 'en',
      durationInSeconds: 2.5,
      usage: { seconds: 2.5 },
    });
  });

  it('keeps only finalized text and joins separate finalized segments', async () => {
    const result = await model().doStream!({
      audio: audio(),
      inputAudioFormat,
    });
    const parts = convertReadableStreamToArray(result.stream);
    const socket = MockWebSocket.instances[0];
    socket.open();
    await flush();
    socket.message(results('Hello'));
    socket.message(results('world'));
    socket.message(results('unfinished', false));
    socket.serverClose();
    expect((await parts).at(-1)).toMatchObject({
      type: 'finish',
      text: 'Hello world',
    });
  });

  it('omits native usage when only transcript timing is available', async () => {
    const result = await model().doStream!({
      audio: audio(),
      inputAudioFormat,
    });
    const parts = convertReadableStreamToArray(result.stream);
    const socket = MockWebSocket.instances[0];
    socket.open();
    await flush();
    socket.message(results('Hello!'));
    socket.serverClose();
    const finish = (await parts).at(-1);
    expect(finish).toMatchObject({ type: 'finish', durationInSeconds: 1.5 });
    expect(finish).not.toHaveProperty('usage');
  });

  it('orders aggregate multichannel transcripts and word timings chronologically', async () => {
    const result = await model().doStream!({
      audio: audio(),
      inputAudioFormat,
      providerOptions: {
        deepgram: { streaming: { channels: 2, multichannel: true } },
      },
    });
    const parts = convertReadableStreamToArray(result.stream);
    const socket = MockWebSocket.instances[0];
    socket.open();
    await flush();
    const later = results('Second', true, 1);
    later.start = 5;
    later.channel.alternatives[0].words = [
      { word: 'second', punctuated_word: 'Second', start: 5.2, end: 5.8 },
    ];
    const earlier = results('First', true, 0);
    earlier.channel.alternatives[0].words = [
      { word: 'first', punctuated_word: 'First', start: 0.2, end: 0.8 },
    ];
    socket.message(later);
    socket.message(earlier);
    socket.message({ type: 'Metadata', duration: 7 });
    const values = await parts;
    expect(values.filter(part => part.type === 'transcript-final')).toEqual([
      expect.objectContaining({ text: 'Second', channelIndex: 1 }),
      expect.objectContaining({ text: 'First', channelIndex: 0 }),
    ]);
    expect(values.at(-1)).toMatchObject({
      text: 'First Second',
      segments: [
        { text: 'First', startSecond: 0.2, endSecond: 0.8 },
        { text: 'Second', startSecond: 5.2, endSecond: 5.8 },
      ],
    });
  });

  it.each([false, true])(
    'accepts speech and utterance events with raw chunks enabled: %s',
    async includeRawChunks => {
      const result = await model().doStream!({
        audio: audio(),
        inputAudioFormat,
        includeRawChunks,
      });
      const parts = convertReadableStreamToArray(result.stream);
      const socket = MockWebSocket.instances[0];
      socket.open();
      await flush();
      const events = [
        { type: 'SpeechStarted', channel: [0], timestamp: 0.1 },
        { type: 'UtteranceEnd', channel: [0, 1], last_word_end: 1.5 },
        { type: 'FutureEvent', channel: 'provider-specific' },
      ];
      for (const event of events) socket.message(event);
      socket.message(results('Hello!'));
      socket.message({ type: 'Metadata', duration: 2 });
      const values = await parts;
      expect(values.at(-1)).toMatchObject({ type: 'finish', text: 'Hello!' });
      expect(values.filter(part => part.type === 'raw')).toEqual(
        includeRawChunks
          ? [
              ...events,
              results('Hello!'),
              { type: 'Metadata', duration: 2 },
            ].map(rawValue => ({ type: 'raw', rawValue }))
          : [],
      );
    },
  );

  it.each([
    ['audio/pcmu', 'mulaw'],
    ['audio/pcma', 'alaw'],
  ])('supports %s', async (type, encoding) => {
    const result = await model().doStream!({
      audio: audio(),
      inputAudioFormat: { type, rate: 8000 },
    });
    expect(
      new URL(MockWebSocket.instances[0].url).searchParams.get('encoding'),
    ).toBe(encoding);
    await result.stream.cancel();
  });

  it.each([
    { type: 'audio/mp3', rate: 16000 },
    { type: 'audio/pcm' },
    { type: 'audio/pcm', rate: 0 },
    { type: 'audio/pcm', rate: 1.5 },
  ])('rejects unsupported raw formats or sample rates: %j', async format => {
    await expect(
      model().doStream!({ audio: audio(), inputAudioFormat: format }),
    ).rejects.toThrow('Deepgram streaming requires');
    expect(MockWebSocket.instances).toHaveLength(0);
  });

  it('rejects Flux models which use a distinct protocol', async () => {
    await expect(
      createDeepgram({
        apiKey: 'test-key',
        webSocket: MockWebSocket,
      }).transcription('flux-general-en').doStream!({
        audio: audio(),
        inputAudioFormat,
      }),
    ).rejects.toThrow('Flux');
  });

  it('warns about batch-only options', async () => {
    const result = await model().doStream!({
      audio: audio(),
      inputAudioFormat,
      providerOptions: {
        deepgram: {
          summarize: 'v2',
          detectLanguage: true,
          streaming: { interimResults: true },
        },
      },
    });
    const parts = convertReadableStreamToArray(result.stream);
    const socket = MockWebSocket.instances[0];
    socket.open();
    await flush();
    socket.serverClose();
    expect((await parts)[0]).toEqual({
      type: 'stream-start',
      warnings: [
        expect.objectContaining({
          feature: 'providerOptions.deepgram.detectLanguage',
        }),
        expect.objectContaining({
          feature: 'providerOptions.deepgram.summarize',
        }),
      ],
    });
    expect(new URL(socket.url).searchParams.has('summarize')).toBe(false);
  });

  it('cancels the audio source when the output is cancelled before opening', async () => {
    const cancel = vi.fn();
    const result = await model().doStream!({
      audio: new ReadableStream({ cancel }),
      inputAudioFormat,
    });
    await result.stream.cancel();
    expect(cancel).toHaveBeenCalledOnce();
    expect(MockWebSocket.instances[0].close).toHaveBeenCalled();
  });

  it('aborts an active connection and cancels a pending audio read', async () => {
    const abortController = new AbortController();
    const cancel = vi.fn();
    const result = await model().doStream!({
      audio: new ReadableStream({ cancel }),
      inputAudioFormat,
      abortSignal: abortController.signal,
    });
    const parts = convertReadableStreamToArray(result.stream);
    const failure = expect(parts).rejects.toThrow('stop');
    MockWebSocket.instances[0].open();
    abortController.abort(new Error('stop'));
    await failure;
    expect(cancel).toHaveBeenCalledOnce();
    expect(MockWebSocket.instances[0].close).toHaveBeenCalled();
  });

  it('handles an already aborted request without opening a socket', async () => {
    const cancel = vi.fn();
    const result = await model().doStream!({
      audio: new ReadableStream({ cancel }),
      inputAudioFormat,
      abortSignal: AbortSignal.abort(new Error('already stopped')),
    });
    await expect(convertReadableStreamToArray(result.stream)).rejects.toThrow(
      'already stopped',
    );
    expect(cancel).toHaveBeenCalledOnce();
    expect(MockWebSocket.instances).toHaveLength(0);
  });

  it.each(['provider', 'malformed', 'socket', 'early-close', 'abnormal-close'])(
    'propagates %s failures and closes the source',
    async failure => {
      const cancel = vi.fn();
      const result = await model().doStream!({
        audio: new ReadableStream({ cancel }),
        inputAudioFormat,
      });
      const parts = convertReadableStreamToArray(result.stream);
      const rejected = expect(parts).rejects.toThrow();
      const socket = MockWebSocket.instances[0];
      socket.open();
      if (failure === 'provider')
        socket.message({ type: 'Error', description: 'invalid audio' });
      if (failure === 'malformed') socket.onmessage?.({ data: 'invalid json' });
      if (failure === 'socket') socket.onerror?.({});
      if (failure === 'early-close') socket.serverClose();
      if (failure === 'abnormal-close') socket.serverClose(1011);
      await rejected;
      expect(cancel).toHaveBeenCalledOnce();
      expect(socket.close).toHaveBeenCalled();
    },
  );

  it('propagates errors from the input producer', async () => {
    const result = await model().doStream!({
      audio: new ReadableStream({
        start(controller) {
          controller.error(new Error('microphone disconnected'));
        },
      }),
      inputAudioFormat,
    });
    const parts = convertReadableStreamToArray(result.stream);
    const rejected = expect(parts).rejects.toThrow('microphone disconnected');
    MockWebSocket.instances[0].open();
    await rejected;
    expect(MockWebSocket.instances[0].close).toHaveBeenCalled();
  });

  it('pauses input reads until the WebSocket send buffer drains', async () => {
    const result = await model().doStream!({
      audio: audio(),
      inputAudioFormat,
    });
    const socket = MockWebSocket.instances[0];
    socket.bufferedAmount = 2 * 1024 * 1024;
    socket.open();
    await flush();
    expect(socket.send).toHaveBeenCalledTimes(1);
    socket.bufferedAmount = 0;
    await vi.waitFor(() =>
      expect(socket.send).toHaveBeenCalledWith(
        JSON.stringify({ type: 'CloseStream' }),
      ),
    );
    await result.stream.cancel();
  });

  it('sends keepalive messages while waiting for live audio and stops on cancellation', async () => {
    vi.useFakeTimers();
    const result = await model().doStream!({
      audio: new ReadableStream(),
      inputAudioFormat,
    });
    const socket = MockWebSocket.instances[0];
    socket.open();
    await vi.advanceTimersByTimeAsync(4000);
    expect(socket.send).toHaveBeenCalledWith(
      JSON.stringify({ type: 'KeepAlive' }),
    );
    await result.stream.cancel();
    const sends = socket.send.mock.calls.length;
    await vi.advanceTimersByTimeAsync(12000);
    expect(socket.send).toHaveBeenCalledTimes(sends);
  });
});
