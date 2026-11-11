import {
  InvalidArgumentError,
  UnsupportedFunctionalityError,
  type Experimental_SpeechModelV4StreamTextPart as SpeechModelV4StreamTextPart,
} from '@ai-sdk/provider';
import {
  convertArrayToReadableStream,
  convertReadableStreamToArray,
} from '@ai-sdk/provider-utils/test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDeepgram } from './deepgram-provider';
import type { DeepgramSpeechModel } from './deepgram-speech-model';
import { KEEPALIVE_INTERVAL_MS } from './deepgram-speech-stream';

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
  audio(bytes: number[]) {
    this.onmessage?.({ data: new Uint8Array(bytes).buffer });
  }
  serverClose(code = 1000, reason?: string) {
    this.readyState = 3;
    this.onclose?.({ code, reason });
  }
  sentMessages() {
    return this.send.mock.calls.map(([value]) => JSON.parse(value as string));
  }
}

const flush = () => new Promise(resolve => setTimeout(resolve, 0));
const model = (modelId = 'flux') =>
  createDeepgram({
    apiKey: 'test-key',
    webSocket: MockWebSocket,
  }).speech(modelId) as DeepgramSpeechModel;
const text = (...parts: Array<string | SpeechModelV4StreamTextPart>) =>
  convertArrayToReadableStream(
    parts.map(part =>
      typeof part === 'string' ? { type: 'text' as const, text: part } : part,
    ),
  );
const connected = {
  type: 'Connected',
  request_id: 'request-id',
  model_name: 'haley',
  model_version: '2026-08-12.0',
  model_uuids: ['model-uuid'],
};
const sessionMetadata = {
  type: 'SessionMetadata',
  total_audio_duration_ms: 1200,
  total_input_character_count: 12,
  total_billable_character_count: 11,
};

describe('Deepgram speech streaming', () => {
  beforeEach(() => {
    MockWebSocket.instances = [];
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('uses the /v2/speak endpoint, the composed Flux voice, auth subprotocols, and options', async () => {
    const result = await model().doStream({
      text: text('Hello'),
      voice: 'haley',
      language: 'en',
      speed: 1.1,
      outputFormat: { type: 'audio/pcm', rate: 16000 },
      headers: { 'X-Request': 'request' },
      providerOptions: {
        deepgram: {
          expressivity: 1,
          mipOptOut: true,
          tag: ['one', 'two'],
        },
      },
    });
    const socket = MockWebSocket.instances[0];
    const url = new URL(socket.url);
    expect(url.origin + url.pathname).toBe('wss://api.deepgram.com/v2/speak');
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      model: 'flux-haley-en',
      encoding: 'linear16',
      sample_rate: '16000',
      speed: '1.1',
      expressivity: '1',
      mip_opt_out: 'true',
    });
    expect(url.searchParams.getAll('tag')).toEqual(['one', 'two']);
    expect(socket.protocols).toEqual(['token', 'test-key']);
    expect(socket.options?.headers).toMatchObject({
      authorization: 'Token test-key',
      'x-request': 'request',
    });
    expect(result.request?.body).not.toContain('test-key');
    await result.stream.cancel();
    expect(socket.close).toHaveBeenCalled();
  });

  it('defaults to 24 kHz PCM and passes full Flux voice IDs through', async () => {
    const result = await model('flux-kit-en').doStream({ text: text('Hello') });
    const url = new URL(MockWebSocket.instances[0].url);
    expect(Object.fromEntries(url.searchParams)).toEqual({
      model: 'flux-kit-en',
      encoding: 'linear16',
      sample_rate: '24000',
    });
    await result.stream.cancel();
  });

  it.each([
    ['audio/pcmu', 'mulaw'],
    ['audio/pcma', 'alaw'],
  ])('supports %s at its 8 kHz default', async (type, encoding) => {
    const result = await model().doStream({
      text: text('Hello'),
      voice: 'haley',
      outputFormat: { type },
    });
    const url = new URL(MockWebSocket.instances[0].url);
    expect(url.searchParams.get('encoding')).toBe(encoding);
    expect(url.searchParams.get('sample_rate')).toBe('8000');
    await result.stream.cancel();
  });

  it('forwards text parts as Speak messages, then flushes and closes', async () => {
    const result = await model().doStream({
      text: text('Hello ', '', 'there.'),
      voice: 'haley',
    });
    const parts = convertReadableStreamToArray(result.stream);
    const socket = MockWebSocket.instances[0];
    socket.open();
    await flush();
    expect(socket.sentMessages()).toEqual([
      { type: 'Speak', text: 'Hello ' },
      { type: 'Speak', text: 'there.' },
      { type: 'Flush' },
      { type: 'Close' },
    ]);
    socket.message(sessionMetadata);
    await parts;
  });

  it('emits audio frames, response metadata, usage, and provider metadata', async () => {
    const result = await model().doStream({
      text: text('Hello there.'),
      voice: 'haley',
      includeRawChunks: true,
    });
    const parts = convertReadableStreamToArray(result.stream);
    const socket = MockWebSocket.instances[0];
    socket.open();
    await flush();
    socket.message(connected);
    socket.message({ type: 'SpeechStarted', speech_id: 'dg_sp_1' });
    socket.audio([1, 2]);
    socket.audio([]);
    socket.audio([3, 4]);
    socket.message(sessionMetadata);
    const values = await parts;

    expect(values[0]).toEqual({ type: 'stream-start', warnings: [] });
    expect(values).toContainEqual({
      type: 'response-metadata',
      timestamp: expect.any(Date),
      modelId: 'flux',
      body: connected,
    });
    expect(values.filter(part => part.type === 'audio')).toEqual([
      {
        type: 'audio',
        audio: new Uint8Array([1, 2]),
        audioFormat: { type: 'audio/pcm', rate: 24000 },
      },
      {
        type: 'audio',
        audio: new Uint8Array([3, 4]),
        audioFormat: { type: 'audio/pcm', rate: 24000 },
      },
    ]);
    expect(values.filter(part => part.type === 'raw')).toEqual(
      [
        connected,
        { type: 'SpeechStarted', speech_id: 'dg_sp_1' },
        sessionMetadata,
      ].map(rawValue => ({ type: 'raw', rawValue })),
    );
    expect(values.at(-1)).toEqual({
      type: 'finish',
      usage: {
        inputCharacters: 11,
        raw: {
          total_audio_duration_ms: 1200,
          total_input_character_count: 12,
          total_billable_character_count: 11,
        },
      },
      providerMetadata: {
        deepgram: {
          modelName: 'haley',
          charCount: 11,
          requestId: 'request-id',
        },
      },
    });
    expect(socket.close).toHaveBeenCalledWith(1000);
  });

  it('skips the flush when there is no text to speak', async () => {
    const result = await model().doStream({ text: text(), voice: 'haley' });
    const parts = convertReadableStreamToArray(result.stream);
    const socket = MockWebSocket.instances[0];
    socket.open();
    await flush();
    expect(socket.sentMessages()).toEqual([{ type: 'Close' }]);
    socket.message({ ...sessionMetadata, total_billable_character_count: 0 });
    expect((await parts).at(-1)).toMatchObject({
      type: 'finish',
      usage: { inputCharacters: 0 },
    });
  });

  it('warns about batch-only provider options, instructions, and an ignored voice', async () => {
    const result = await model('flux-haley-en').doStream({
      text: text('Hello'),
      voice: 'kit',
      instructions: 'Speak slowly.',
      providerOptions: {
        deepgram: { encoding: 'mp3', bitRate: 48000 },
      },
    });
    const parts = convertReadableStreamToArray(result.stream);
    const socket = MockWebSocket.instances[0];
    const url = new URL(socket.url);
    expect(url.searchParams.get('model')).toBe('flux-haley-en');
    expect(url.searchParams.get('encoding')).toBe('linear16');
    expect(url.searchParams.has('bit_rate')).toBe(false);
    socket.open();
    await flush();
    socket.message(sessionMetadata);
    const [start] = await parts;
    expect(
      start.type === 'stream-start'
        ? start.warnings.map(warning =>
            warning.type === 'unsupported' ? warning.feature : warning.type,
          )
        : [],
    ).toEqual([
      'voice',
      'providerOptions.deepgram.encoding',
      'providerOptions.deepgram.bitRate',
      'instructions',
    ]);
  });

  it('rejects Aura models, which have no streaming endpoint here, and releases the text stream', async () => {
    const cancel = vi.fn();
    const error = await model('aura-2')
      .doStream({
        text: new ReadableStream({ cancel }),
        voice: 'thalia',
      })
      .catch(error => error);
    expect(UnsupportedFunctionalityError.isInstance(error)).toBe(true);
    expect(error.message).toContain('Flux TTS');
    expect(cancel).toHaveBeenCalled();
    expect(MockWebSocket.instances).toHaveLength(0);
  });

  it.each([
    { type: 'audio/mpeg' },
    { type: 'audio/pcm', rate: 22050 },
    { type: 'audio/pcmu', rate: 24000 },
  ])(
    'rejects output formats the socket cannot emit: %j',
    async outputFormat => {
      const error = await model()
        .doStream({ text: text('Hello'), voice: 'haley', outputFormat })
        .catch(error => error);
      expect(InvalidArgumentError.isInstance(error)).toBe(true);
      expect(error.message).toContain('raw audio only');
      expect(MockWebSocket.instances).toHaveLength(0);
    },
  );

  it('rejects the callback option', async () => {
    await expect(
      model().doStream({
        text: text('Hello'),
        voice: 'haley',
        providerOptions: {
          deepgram: { callback: 'https://example.com/callback' },
        },
      }),
    ).rejects.toThrow('callback');
  });

  it('errors the stream when a text part requests another voice', async () => {
    const result = await model().doStream({
      text: text('Hello', { type: 'text', text: 'Hi', voice: 'kit' }),
      voice: 'haley',
    });
    const parts = convertReadableStreamToArray(result.stream);
    const socket = MockWebSocket.instances[0];
    socket.open();
    await expect(parts).rejects.toThrow('single voice per stream ("haley")');
    expect(socket.close).toHaveBeenCalled();
  });

  it.each([
    [
      'a fatal error event',
      (socket: MockWebSocket) =>
        socket.message({
          type: 'Error',
          code: 'DATA-0002',
          description: 'Inline pause is not supported.',
        }),
      'Deepgram speech stream error: Inline pause is not supported.',
    ],
    [
      'a close before the session totals',
      (socket: MockWebSocket) => socket.serverClose(1011, 'server error'),
      'closed before completion (1011): server error',
    ],
  ])('errors the stream on %s', async (_name, trigger, message) => {
    const result = await model().doStream({
      text: text('Hello'),
      voice: 'haley',
    });
    const parts = convertReadableStreamToArray(result.stream);
    const socket = MockWebSocket.instances[0];
    socket.open();
    await flush();
    trigger(socket);
    await expect(parts).rejects.toThrow(message);
    expect(socket.close).toHaveBeenCalled();
  });

  it('keeps an idle session alive with empty Configure messages and stops on cancellation', async () => {
    vi.useFakeTimers();
    const cancel = vi.fn();
    const result = await model().doStream({
      text: new ReadableStream<SpeechModelV4StreamTextPart>({
        start(controller) {
          controller.enqueue({ type: 'text', text: 'Hello' });
        },
        cancel,
      }),
      voice: 'haley',
    });
    const socket = MockWebSocket.instances[0];
    socket.open();
    await vi.advanceTimersByTimeAsync(KEEPALIVE_INTERVAL_MS * 2);
    expect(socket.sentMessages()).toEqual([
      { type: 'Speak', text: 'Hello' },
      { type: 'Configure' },
      { type: 'Configure' },
    ]);
    await result.stream.cancel();
    expect(cancel).toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(KEEPALIVE_INTERVAL_MS * 2);
    expect(socket.send).toHaveBeenCalledTimes(3);
  });

  it('keeps the session alive while waiting for the first text part', async () => {
    vi.useFakeTimers();
    let textController!: ReadableStreamDefaultController<SpeechModelV4StreamTextPart>;
    const result = await model().doStream({
      text: new ReadableStream<SpeechModelV4StreamTextPart>({
        start(controller) {
          textController = controller;
        },
      }),
      voice: 'haley',
    });
    const parts = convertReadableStreamToArray(result.stream);
    const socket = MockWebSocket.instances[0];
    socket.open();

    // A slow text producer (e.g. a reasoning model) sends nothing for longer
    // than the server's 60 s inactivity timeout.
    await vi.advanceTimersByTimeAsync(KEEPALIVE_INTERVAL_MS * 2);
    expect(socket.sentMessages()).toEqual([
      { type: 'Configure' },
      { type: 'Configure' },
    ]);

    textController.enqueue({ type: 'text', text: 'Hello' });
    textController.close();
    await vi.advanceTimersByTimeAsync(0);
    expect(socket.sentMessages().slice(2)).toEqual([
      { type: 'Speak', text: 'Hello' },
      { type: 'Flush' },
      { type: 'Close' },
    ]);

    // No keepalive follows the end of the input.
    await vi.advanceTimersByTimeAsync(KEEPALIVE_INTERVAL_MS * 2);
    expect(socket.send).toHaveBeenCalledTimes(5);
    socket.message(sessionMetadata);
    await parts;
  });

  it('handles an already aborted request without opening a socket', async () => {
    const controller = new AbortController();
    controller.abort(new Error('stop'));
    const result = await model().doStream({
      text: text('Hello'),
      voice: 'haley',
      abortSignal: controller.signal,
    });
    await expect(convertReadableStreamToArray(result.stream)).rejects.toThrow(
      'stop',
    );
    expect(MockWebSocket.instances).toHaveLength(0);
  });
});
