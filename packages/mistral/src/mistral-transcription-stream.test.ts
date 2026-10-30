import {
  convertArrayToReadableStream,
  convertReadableStreamToArray,
} from '@ai-sdk/provider-utils/test';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMistral } from './mistral-provider';
import { MistralTranscriptionModel } from './mistral-transcription-model';

class MockWebSocket {
  static instances: MockWebSocket[] = [];
  readyState = 1;
  bufferedAmount = 0;
  send = vi.fn<(data: string) => void>();
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
  message(value: unknown) {
    this.onmessage?.({ data: JSON.stringify(value) });
  }
}
const flush = () => new Promise(resolve => setTimeout(resolve, 0));
const audioFormat = { type: 'audio/pcm', rate: 24000 };
function model() {
  return new MistralTranscriptionModel('voxtral-mini-transcribe-realtime-3', {
    provider: 'mistral.transcription',
    baseURL: 'https://api.mistral.ai/v1',
    webSocket: MockWebSocket,
    _internal: { currentDate: () => new Date(0) },
  });
}
const emptyAudio = () => convertArrayToReadableStream<Uint8Array>([]);
async function start(
  options: Partial<Parameters<ReturnType<typeof model>['doStream']>[0]> = {},
) {
  const result = await model().doStream({
    audio: emptyAudio(),
    inputAudioFormat: audioFormat,
    ...options,
  });
  const ws = MockWebSocket.instances[0];
  ws.message({ type: 'session.created' });
  ws.message({ type: 'session.updated' });
  await flush();
  return { result, ws };
}

beforeEach(() => {
  MockWebSocket.instances = [];
});

describe('realtime transcription', () => {
  it('configures before sending bytes/base64 audio and waits for the final transcript', async () => {
    const result = await model().doStream({
      audio: convertArrayToReadableStream([new Uint8Array([1, 2]), 'AwQ=']),
      inputAudioFormat: audioFormat,
      providerOptions: {
        mistral: {
          language: 'en',
          contextBias: ['AI SDK'],
          targetStreamingDelayMs: 480,
        },
      },
    });
    const parts = convertReadableStreamToArray(result.stream);
    const ws = MockWebSocket.instances[0];
    expect(ws.url.toString()).toBe(
      'wss://api.mistral.ai/v1/audio/transcriptions/realtime?model=voxtral-mini-transcribe-realtime-3',
    );
    expect(ws.send).not.toHaveBeenCalled();
    ws.message({ type: 'session.created' });
    await flush();
    expect(ws.send.mock.calls.map(([value]) => JSON.parse(value))).toEqual([
      {
        type: 'session.update',
        session: {
          audio_format: { encoding: 'pcm_s16le', sample_rate: 24000 },
          language: 'en',
          context_bias: ['AI SDK'],
          target_streaming_delay_ms: 480,
        },
      },
    ]);
    ws.message({ type: 'session.updated' });
    await flush();
    expect(
      ws.send.mock.calls.slice(1).map(([value]) => JSON.parse(value)),
    ).toEqual([
      { type: 'input_audio.append', audio: 'AQI=' },
      { type: 'input_audio.append', audio: 'AwQ=' },
      { type: 'input_audio.end' },
    ]);
    expect(ws.close).not.toHaveBeenCalled();
    ws.message({ type: 'transcription.text.delta', text: 'Hello' });
    ws.message({ type: 'transcription.text.delta', text: ' world.' });
    ws.message({
      type: 'transcription.done',
      text: 'Hello world.',
      language: 'en',
      model: 'resolved-model',
      segments: [],
      usage: { prompt_audio_seconds: 2, total_tokens: 5 },
    });
    const events = await parts;
    expect(events.filter(event => event.type === 'transcript-delta')).toEqual([
      { type: 'transcript-delta', delta: 'Hello' },
      { type: 'transcript-delta', delta: ' world.' },
    ]);
    expect(events.at(-1)).toMatchObject({
      type: 'finish',
      text: 'Hello world.',
      language: 'en',
      durationInSeconds: 2,
      usage: { prompt_audio_seconds: 2, total_tokens: 5 },
    });
    expect(events.at(-2)).toMatchObject({
      type: 'response-metadata',
      modelId: 'resolved-model',
    });
    expect(events.some(event => event.type === 'raw')).toBe(false);
    expect(result.response).toEqual({
      timestamp: new Date(0),
      modelId: 'voxtral-mini-transcribe-realtime-3',
    });
    expect(ws.close).toHaveBeenCalledOnce();
  });

  it('passes provider and request headers, custom URLs, and future model IDs through', async () => {
    const mistral = createMistral({
      apiKey: 'test-key',
      baseURL: 'http://proxy.test/custom/',
      webSocket: MockWebSocket,
      headers: { 'X-Provider': 'provider', 'X-Override': 'old' },
    });
    const result = await mistral.transcription('future/model').doStream!({
      audio: emptyAudio(),
      inputAudioFormat: { type: 'audio/pcm' },
      headers: {
        'X-Request': 'request',
        'X-Override': 'new',
        'X-Undefined': undefined,
      },
    });
    const ws = MockWebSocket.instances[0];
    expect(ws.url.toString()).toBe(
      'ws://proxy.test/custom/audio/transcriptions/realtime?model=future%2Fmodel',
    );
    expect(ws.options?.headers).toMatchObject({
      authorization: 'Bearer test-key',
      'x-provider': 'provider',
      'X-Request': 'request',
      'X-Override': 'new',
    });
    expect(ws.options?.headers).not.toHaveProperty('X-Undefined');
    expect(ws.options?.headers?.['user-agent']).toContain('ai-sdk-mistral/');
    ws.message({ type: 'session.created' });
    await flush();
    expect(
      JSON.parse(ws.send.mock.calls[0][0]).session.audio_format.sample_rate,
    ).toBe(16000);
    await result.stream.cancel();
  });

  it('preserves untimed speaker segments without fabricating timestamps', async () => {
    const { result, ws } = await start({
      providerOptions: {
        mistral: { diarize: true, speakerReferences: { Jane: 'AQI=' } },
      },
    });
    expect(JSON.parse(ws.send.mock.calls[0][0]).session).toMatchObject({
      diarize: true,
      speaker_references: { Jane: 'AQI=' },
    });
    const segments = [
      { text: ' Hi.', start: null, end: null, speaker_id: 'Jane' },
      { text: ' Hello.', start: 1, end: 2, speaker_id: 'speaker_2' },
    ];
    ws.message({ type: 'transcription.segment', ...segments[0] });
    ws.message({ type: 'transcription.segment', ...segments[1] });
    ws.message({
      type: 'transcription.done',
      text: ' Hi. Hello.',
      segments,
      language: null,
    });
    const events = await convertReadableStreamToArray(result.stream);
    expect(events[1]).toEqual({
      type: 'transcript-final',
      text: ' Hi.',
      startSecond: undefined,
      endSecond: undefined,
      providerMetadata: { mistral: { speakerId: 'Jane' } },
    });
    expect(events.at(-1)).toMatchObject({
      type: 'finish',
      segments: [{ text: ' Hello.', startSecond: 1, endSecond: 2 }],
      providerMetadata: {
        mistral: {
          segments: [
            { text: ' Hi.', speakerId: 'Jane' },
            {
              text: ' Hello.',
              startSecond: 1,
              endSecond: 2,
              speakerId: 'speaker_2',
            },
          ],
        },
      },
    });
  });

  it('exposes turn and unknown events as raw chunks without finalizing early', async () => {
    const { result, ws } = await start({
      includeRawChunks: true,
      providerOptions: {
        mistral: {
          turnDetection: {
            startThreshold: 0.5,
            eagerEndThreshold: 0.4,
            endThreshold: 0.3,
            minSilenceMs: 300,
            endTimeoutMs: 2500,
          },
        },
      },
    });
    expect(JSON.parse(ws.send.mock.calls[0][0]).session.turn_detection).toEqual(
      {
        start_threshold: 0.5,
        eager_end_threshold: 0.4,
        end_threshold: 0.3,
        min_silence_ms: 300,
        end_timeout_ms: 2500,
      },
    );
    const turns = [
      'turn.start',
      'turn.eager_end',
      'turn.resume',
      'turn.end',
    ].map(type => ({ type, time_s: 1, end_reason: 'threshold' }));
    turns.forEach(event => ws.message(event));
    ws.message({ type: 'future.event', new_field: true });
    await flush();
    expect(ws.close).not.toHaveBeenCalled();
    ws.message({ type: 'transcription.text.delta', text: 'Trailing words.' });
    ws.message({
      type: 'transcription.done',
      text: 'Trailing words.',
      segments: null,
      usage: null,
    });
    const events = await convertReadableStreamToArray(result.stream);
    for (const turn of turns)
      expect(events).toContainEqual({ type: 'raw', rawValue: turn });
    expect(events).toContainEqual({
      type: 'raw',
      rawValue: { type: 'future.event', new_field: true },
    });
    expect(events).toContainEqual({
      type: 'transcript-delta',
      delta: 'Trailing words.',
    });
    expect(events.at(-1)).toMatchObject({
      type: 'finish',
      text: 'Trailing words.',
      segments: [],
    });
  });

  it('splits large audio chunks and skips empty chunks', async () => {
    const bytes = new Uint8Array(300000).fill(7);
    const { result, ws } = await start({
      audio: convertArrayToReadableStream([new Uint8Array(), bytes]),
    });
    const messages = ws.send.mock.calls.map(([value]) => JSON.parse(value));
    const chunks = messages.filter(
      message => message.type === 'input_audio.append',
    );
    expect(chunks.length).toBe(5);
    expect(chunks.every(chunk => chunk.audio.length < 262144)).toBe(true);
    expect(
      Buffer.concat(chunks.map(chunk => Buffer.from(chunk.audio, 'base64'))),
    ).toEqual(Buffer.from(bytes));
    expect(messages.at(-1)).toEqual({ type: 'input_audio.end' });
    await result.stream.cancel();
  });

  it('does not start a second sender on duplicate session events', async () => {
    const { result, ws } = await start();
    ws.message({ type: 'session.created' });
    ws.message({ type: 'session.updated' });
    await flush();
    expect(ws.send).toHaveBeenCalledTimes(2);
    await result.stream.cancel();
  });

  it('warns about offline-only options without sending them', async () => {
    const { result, ws } = await start({
      providerOptions: {
        mistral: {
          returnLanguage: true,
          temperature: 0.2,
          timestampGranularities: ['segment'],
        },
      },
    });
    const reader = result.stream.getReader();
    const first = await reader.read();
    expect(first.value).toMatchObject({
      type: 'stream-start',
      warnings: [
        { feature: 'providerOptions.mistral.returnLanguage' },
        { feature: 'providerOptions.mistral.temperature' },
        { feature: 'providerOptions.mistral.timestampGranularities' },
      ],
    });
    expect(JSON.parse(ws.send.mock.calls[0][0]).session).toEqual({
      audio_format: { encoding: 'pcm_s16le', sample_rate: 24000 },
    });
    await reader.cancel();
  });

  it.each([
    { type: 'audio/mpeg' },
    { type: 'audio/pcm', rate: 0 },
    { type: 'audio/pcm', rate: 1.5 },
  ])(
    'rejects unsupported input format %j before connecting',
    async inputAudioFormat => {
      await expect(
        model().doStream({ audio: emptyAudio(), inputAudioFormat }),
      ).rejects.toThrow('requires audio/pcm');
      expect(MockWebSocket.instances).toHaveLength(0);
    },
  );
  it.each([79, 1201, 2399, 2401, 480.5])(
    'rejects invalid delay %s',
    async targetStreamingDelayMs => {
      await expect(
        model().doStream({
          audio: emptyAudio(),
          inputAudioFormat: audioFormat,
          providerOptions: { mistral: { targetStreamingDelayMs } },
        }),
      ).rejects.toThrow();
      expect(MockWebSocket.instances).toHaveLength(0);
    },
  );
  it.each([80, 1200, 2400])(
    'accepts delay %s and default turn detection',
    async targetStreamingDelayMs => {
      const { result, ws } = await start({
        providerOptions: {
          mistral: { targetStreamingDelayMs, turnDetection: {} },
        },
      });
      expect(JSON.parse(ws.send.mock.calls[0][0]).session).toMatchObject({
        target_streaming_delay_ms: targetStreamingDelayMs,
        turn_detection: {},
      });
      await result.stream.cancel();
    },
  );

  it.each([
    'abort',
    'cancel',
    'provider-error',
    'socket-error',
    'close',
    'invalid-json',
    'invalid-event',
    'audio-error',
  ] as const)('cleans up on %s during audio streaming', async failure => {
    const cancel = vi.fn();
    let audioController!: ReadableStreamDefaultController<Uint8Array>;
    const audio = new ReadableStream<Uint8Array>({
      start(c) {
        audioController = c;
      },
      cancel,
    });
    const abort = new AbortController();
    const { result, ws } = await start({ audio, abortSignal: abort.signal });
    if (failure === 'cancel') {
      await result.stream.cancel();
    } else {
      const parts = convertReadableStreamToArray(result.stream);
      const rejected = expect(parts).rejects.toThrow();
      if (failure === 'abort') abort.abort(new Error('cancelled'));
      if (failure === 'provider-error')
        ws.message({
          type: 'error',
          error: {
            message: 'Diarization is not compatible with turn detection.',
            code: 1,
          },
        });
      if (failure === 'socket-error') ws.onerror?.({});
      if (failure === 'close')
        ws.onclose?.({ code: 1006, reason: 'lost connection' });
      if (failure === 'invalid-json') ws.onmessage?.({ data: '{' });
      if (failure === 'invalid-event')
        ws.message({ type: 'transcription.text.delta', text: 123 });
      if (failure === 'audio-error')
        audioController.error(new Error('microphone failed'));
      await rejected;
    }
    await flush();
    expect(ws.close).toHaveBeenCalledOnce();
    if (failure !== 'audio-error') expect(cancel).toHaveBeenCalledOnce();
    expect(audio.locked).toBe(false);
    const count = ws.send.mock.calls.length;
    ws.message({ type: 'session.updated' });
    ws.message({ type: 'transcription.done', text: 'late' });
    await flush();
    expect(ws.send).toHaveBeenCalledTimes(count);
  });

  it.each(['abort', 'cancel', 'constructor'] as const)(
    'cancels upstream on %s before the session starts',
    async failure => {
      const cancel = vi.fn();
      const abort = new AbortController();
      if (failure === 'abort') abort.abort(new Error('already aborted'));
      const mistral = createMistral({
        apiKey: 'key',
        webSocket:
          failure === 'constructor'
            ? class extends MockWebSocket {
                constructor() {
                  super('');
                  throw new Error('constructor failed');
                }
              }
            : MockWebSocket,
      });
      const result = await mistral.transcription('future-model').doStream!({
        audio: new ReadableStream({ cancel }),
        inputAudioFormat: audioFormat,
        abortSignal: abort.signal,
      });
      if (failure === 'cancel') await result.stream.cancel();
      else
        await expect(
          convertReadableStreamToArray(result.stream),
        ).rejects.toThrow();
      expect(cancel).toHaveBeenCalledOnce();
    },
  );

  it('pauses audio reads when the socket buffer is full and aborts the wait', async () => {
    const cancel = vi.fn();
    const abort = new AbortController();
    const audio = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(new Uint8Array([1, 2]));
        c.enqueue(new Uint8Array([3, 4]));
      },
      cancel,
    });
    const result = await model().doStream({
      audio,
      inputAudioFormat: audioFormat,
      abortSignal: abort.signal,
    });
    const parts = convertReadableStreamToArray(result.stream);
    const rejected = expect(parts).rejects.toThrow('stop');
    const ws = MockWebSocket.instances[0];
    ws.bufferedAmount = 2 * 1024 * 1024;
    ws.message({ type: 'session.created' });
    ws.message({ type: 'session.updated' });
    await flush();
    expect(ws.send).toHaveBeenCalledTimes(2);
    abort.abort(new Error('stop'));
    await rejected;
    await vi.waitFor(() => expect(audio.locked).toBe(false));
    expect(cancel).toHaveBeenCalledOnce();
    expect(ws.send).toHaveBeenCalledTimes(2);
  });

  it('drains the final message before handling an immediate socket close', async () => {
    const { result, ws } = await start();
    ws.onmessage?.({
      data: new Blob([
        JSON.stringify({ type: 'transcription.done', text: 'Complete.' }),
      ]),
    });
    ws.onclose?.({ code: 1000 });
    const events = await convertReadableStreamToArray(result.stream);
    expect(events.at(-1)).toMatchObject({ type: 'finish', text: 'Complete.' });
  });

  it('resumes sending when backpressure clears', async () => {
    const result = await model().doStream({
      audio: convertArrayToReadableStream([
        new Uint8Array([1, 2]),
        new Uint8Array([3, 4]),
      ]),
      inputAudioFormat: audioFormat,
    });
    const ws = MockWebSocket.instances[0];
    ws.bufferedAmount = 2 * 1024 * 1024;
    ws.message({ type: 'session.created' });
    ws.message({ type: 'session.updated' });
    await flush();
    expect(ws.send).toHaveBeenCalledTimes(2);
    ws.bufferedAmount = 0;
    await vi.waitFor(() => expect(ws.send).toHaveBeenCalledTimes(4));
    expect(JSON.parse(ws.send.mock.calls[3][0])).toEqual({
      type: 'input_audio.end',
    });
    await result.stream.cancel();
  });

  it('preserves the provider error message when followed immediately by close', async () => {
    const { result, ws } = await start();
    ws.message({
      type: 'error',
      error: { message: 'invalid model', code: 400 },
    });
    ws.onclose?.({ code: 1000 });
    await expect(convertReadableStreamToArray(result.stream)).rejects.toThrow(
      'invalid model',
    );
  });
});
