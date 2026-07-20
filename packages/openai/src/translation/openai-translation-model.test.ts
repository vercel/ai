import {
  convertArrayToReadableStream,
  convertReadableStreamToArray,
} from '@ai-sdk/provider-utils/test';
import { describe, it, expect, vi } from 'vitest';
import { createOpenAI } from '../openai-provider';
import { OpenAITranslationModel } from './openai-translation-model';

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

function createModel(
  overrides: Partial<{
    headers: () => Record<string, string | undefined>;
    currentDate: () => Date;
  }> = {},
) {
  return new OpenAITranslationModel('gpt-realtime-translate', {
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
      sourceLanguage: 'en',
      outputAudioFormat: { type: 'audio/pcm', rate: 24000 },
      providerOptions: {
        openai: {
          voice: 'alloy',
        },
      },
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
        type: 'translation',
        audio: {
          input: {
            format: { type: 'audio/pcm', rate: 24000 },
            turn_detection: null,
          },
          output: {
            format: { type: 'audio/pcm', rate: 24000 },
            voice: 'alloy',
          },
        },
        translation: {
          model: 'gpt-realtime-translate',
          target_language: 'es',
          source_language: 'en',
        },
      },
    });
    expect(JSON.parse(ws.send.mock.calls[1][0])).toEqual({
      type: 'input_audio_buffer.append',
      audio: 'AQID',
    });
    expect(JSON.parse(ws.send.mock.calls[2][0])).toEqual({
      type: 'input_audio_buffer.commit',
    });

    ws.message({
      type: 'conversation.item.input_audio_transcription.delta',
      item_id: 'item-1',
      delta: 'Hel',
    });
    ws.message({
      type: 'conversation.item.input_audio_transcription.completed',
      item_id: 'item-1',
      transcript: 'Hello',
    });
    ws.message({
      type: 'response.output_audio_transcript.delta',
      item_id: 'item-2',
      delta: 'Ho',
    });
    ws.message({
      type: 'response.output_audio.delta',
      item_id: 'item-2',
      delta: 'BAUG',
    });
    ws.message({
      type: 'response.output_audio_transcript.done',
      item_id: 'item-2',
      transcript: 'Hola',
    });
    ws.message({
      type: 'response.done',
      response: {
        usage: {
          input_token_details: { audio_tokens: 10, text_tokens: 2 },
          output_token_details: { audio_tokens: 20, text_tokens: 3 },
        },
      },
    });

    await expect(partsPromise).resolves.toEqual([
      { type: 'stream-start', warnings: [] },
      { type: 'source-transcript-delta', id: 'item-1', delta: 'Hel' },
      { type: 'source-transcript-final', id: 'item-1', text: 'Hello' },
      { type: 'output-text-delta', id: 'item-2', delta: 'Ho' },
      { type: 'audio', id: 'item-2', audio: 'BAUG' },
      { type: 'output-text-final', id: 'item-2', text: 'Hola' },
      {
        type: 'finish',
        sourceText: 'Hello',
        outputText: 'Hola',
        usage: {
          inputAudioTokens: 10,
          inputTextTokens: 2,
          outputAudioTokens: 20,
          outputTextTokens: 3,
        },
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

  it('should fall back to accumulated deltas when no terminal transcript events arrive', async () => {
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
      type: 'conversation.item.input_audio_transcription.delta',
      item_id: 'item-1',
      delta: 'Hello',
    });
    ws.message({
      type: 'response.output_audio_transcript.delta',
      item_id: 'item-2',
      delta: 'Hola',
    });
    ws.message({ type: 'response.done' });

    const parts = await partsPromise;
    expect(parts.at(-1)).toEqual({
      type: 'finish',
      sourceText: 'Hello',
      outputText: 'Hola',
      usage: undefined,
    });
  });

  it('should omit output audio session config and source language when not provided', async () => {
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

    expect(JSON.parse(ws.send.mock.calls[0][0])).toEqual({
      type: 'session.update',
      session: {
        type: 'translation',
        audio: {
          input: {
            format: { type: 'audio/pcm', rate: 24000 },
            turn_detection: null,
          },
        },
        translation: {
          model: 'gpt-realtime-translate',
          target_language: 'es',
        },
      },
    });

    ws.message({
      type: 'response.output_audio_transcript.done',
      item_id: 'item-1',
      transcript: 'Hola',
    });
    ws.message({ type: 'response.done' });
    await expect(partsPromise).resolves.toBeDefined();
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
      type: 'response.output_audio_transcript.done',
      item_id: 'item-1',
      transcript: 'Hola',
    });
    ws.message({ type: 'response.done' });

    const parts = await partsPromise;
    expect(parts.filter(part => part.type === 'raw')).toEqual([
      { type: 'raw', rawValue: { type: 'session.updated' } },
      {
        type: 'raw',
        rawValue: {
          type: 'response.output_audio_transcript.done',
          item_id: 'item-1',
          transcript: 'Hola',
        },
      },
      { type: 'raw', rawValue: { type: 'response.done' } },
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
      type: 'response.output_audio_transcript.done',
      item_id: 'item-1',
      transcript: 'Hola',
    });
    ws.message({ type: 'response.done' });
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
    const model = new OpenAITranslationModel('gpt-realtime-translate', {
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

  it('should error the stream with the server message on error events', async () => {
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

    await expect(partsPromise).rejects.toThrow('invalid target language');
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
    expect(model.provider).toBe('openai.translation');
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

  it('should include finalized segments and trailing un-finalized deltas at response.done', async () => {
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

    // segment 1: finalized via terminal events
    ws.message({
      type: 'conversation.item.input_audio_transcription.delta',
      item_id: 'item-1',
      delta: 'Hello ',
    });
    ws.message({
      type: 'conversation.item.input_audio_transcription.completed',
      item_id: 'item-1',
      transcript: 'Hello ',
    });
    ws.message({
      type: 'response.output_audio_transcript.delta',
      item_id: 'item-1',
      delta: 'Hola ',
    });
    ws.message({
      type: 'response.output_audio_transcript.done',
      item_id: 'item-1',
      transcript: 'Hola ',
    });

    // segment 2: deltas still pending when response.done arrives
    ws.message({
      type: 'conversation.item.input_audio_transcription.delta',
      item_id: 'item-2',
      delta: 'world',
    });
    ws.message({
      type: 'response.output_audio_transcript.delta',
      item_id: 'item-2',
      delta: 'mundo',
    });
    ws.message({ type: 'response.done' });

    const parts = await partsPromise;
    expect(parts.at(-1)).toEqual({
      type: 'finish',
      sourceText: 'Hello world',
      outputText: 'Hola mundo',
      usage: undefined,
    });
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
      type: 'response.output_audio.delta',
      item_id: 'item-1',
      delta: '',
    });
    ws.message({
      type: 'response.output_audio.delta',
      item_id: 'item-1',
      delta: 'BAUG',
    });
    ws.message({
      type: 'response.output_audio_transcript.done',
      item_id: 'item-1',
      transcript: 'Hola',
    });
    ws.message({ type: 'response.done' });

    const parts = await partsPromise;
    expect(parts.filter(part => part.type === 'audio')).toEqual([
      { type: 'audio', id: 'item-1', audio: 'BAUG' },
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
      type: 'response.output_audio_transcript.delta',
      item_id: 'item-1',
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
      type: 'response.output_audio_transcript.delta',
      item_id: 'item-1',
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
      type: 'response.output_audio_transcript.done',
      item_id: 'item-1',
      transcript: 'Hola',
    });
    ws.message({ type: 'response.done' });

    const parts = await partsPromise;
    expect(parts.at(-1)?.type).toBe('finish');

    // post-finish messages are a no-op (no throw, no new parts):
    ws.message({
      type: 'response.output_audio_transcript.done',
      item_id: 'item-2',
      transcript: 'late',
    });
    ws.message({ type: 'response.done' });
    await flush();
    expect(parts).toHaveLength(3);
  });
});
