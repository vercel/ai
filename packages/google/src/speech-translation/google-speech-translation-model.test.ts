import fs from 'node:fs';

import { convertUint8ArrayToBase64 } from '@ai-sdk/provider-utils';
import {
  convertArrayToReadableStream,
  convertReadableStreamToArray,
} from '@ai-sdk/provider-utils/test';
import { describe, it, expect, vi } from 'vitest';
import { createGoogle } from '../google-provider';
import { GoogleSpeechTranslationModel } from './google-speech-translation-model';

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
    finishGraceMs: number;
  }> = {},
) {
  return new GoogleSpeechTranslationModel('gemini-3.5-live-translate-preview', {
    provider: 'test-provider',
    baseURL: 'https://generativelanguage.googleapis.com/v1beta',
    headers:
      overrides.headers ?? (() => ({ 'x-goog-api-key': 'test-api-key' })),
    webSocket: MockWebSocket,
    _internal: {
      finishGraceMs: overrides.finishGraceMs ?? 0,
      ...(overrides.currentDate != null
        ? { currentDate: overrides.currentDate }
        : {}),
    },
  });
}

describe('doStream', () => {
  it('should stream translation over the Gemini Live API WebSocket', async () => {
    MockWebSocket.instances = [];
    const testDate = new Date(0);
    const model = createModel({ currentDate: () => testDate });

    const result = await model.doStream({
      audio: convertArrayToReadableStream([new Uint8Array([1, 2, 3])]),
      inputAudioFormat: { type: 'audio/pcm', rate: 16000 },
      targetLanguage: 'es',
      providerOptions: {
        google: {
          echoTargetLanguage: true,
        },
      },
    });

    const partsPromise = convertReadableStreamToArray(result.stream);
    const ws = MockWebSocket.instances[0];
    expect(ws.url.toString()).toBe(
      'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=test-api-key',
    );
    expect(ws.options?.headers).toEqual({});

    ws.open();
    await flush();

    // audio is gated on setupComplete: only the setup message was sent
    expect(ws.send).toHaveBeenCalledTimes(1);
    expect(JSON.parse(ws.send.mock.calls[0][0])).toEqual({
      setup: {
        model: 'models/gemini-3.5-live-translate-preview',
        generationConfig: {
          responseModalities: ['AUDIO'],
          translationConfig: {
            targetLanguageCode: 'es',
            echoTargetLanguage: true,
          },
        },
        inputAudioTranscription: {},
        outputAudioTranscription: {},
      },
    });

    ws.message({ setupComplete: {} });
    await flush();

    expect(JSON.parse(ws.send.mock.calls[1][0])).toEqual({
      realtimeInput: {
        audio: {
          data: 'AQID',
          mimeType: 'audio/pcm;rate=16000',
        },
      },
    });
    expect(JSON.parse(ws.send.mock.calls[2][0])).toEqual({
      realtimeInput: { audioStreamEnd: true },
    });

    ws.message({
      serverContent: {
        inputTranscription: { text: 'Hello' },
      },
    });
    ws.message({
      serverContent: {
        modelTurn: {
          parts: [{ inlineData: { data: 'BAUG' } }],
        },
        outputTranscription: { text: 'Hola' },
      },
    });
    ws.message({
      usageMetadata: {
        promptTokensDetails: [
          { modality: 'AUDIO', tokenCount: 10 },
          { modality: 'TEXT', tokenCount: 2 },
        ],
        responseTokensDetails: [
          { modality: 'AUDIO', tokenCount: 20 },
          { modality: 'TEXT', tokenCount: 3 },
        ],
      },
    });
    ws.message({
      serverContent: { turnComplete: true },
    });

    await expect(partsPromise).resolves.toEqual([
      { type: 'stream-start', warnings: [] },
      { type: 'source-transcript-delta', id: 'google-item-0', delta: 'Hello' },
      { type: 'audio', id: 'google-item-0', audio: 'BAUG' },
      { type: 'output-text-delta', id: 'google-item-0', delta: 'Hola' },
      {
        type: 'source-transcript-final',
        id: 'google-item-0',
        text: 'Hello',
      },
      { type: 'output-text-final', id: 'google-item-0', text: 'Hola' },
      {
        type: 'finish',
        sourceText: 'Hello',
        outputText: 'Hola',
        usage: {
          inputAudioTokens: 10,
          outputAudioTokens: 20,
        },
      },
    ]);
    expect(result.response).toEqual({
      timestamp: testDate,
      modelId: 'gemini-3.5-live-translate-preview',
    });
  });

  it('should warn about unsupported sourceLanguage and outputAudioFormat', async () => {
    MockWebSocket.instances = [];
    const model = createModel();

    const result = await model.doStream({
      audio: convertArrayToReadableStream([new Uint8Array([1, 2, 3])]),
      inputAudioFormat: { type: 'audio/pcm', rate: 16000 },
      targetLanguage: 'es',
      sourceLanguage: 'en',
      outputAudioFormat: { type: 'audio/pcm', rate: 24000 },
    });

    const partsPromise = convertReadableStreamToArray(result.stream);
    const ws = MockWebSocket.instances[0];
    ws.open();
    ws.message({ setupComplete: {} });
    await flush();

    ws.message({
      serverContent: {
        outputTranscription: { text: 'Hola' },
      },
    });
    ws.message({ serverContent: { turnComplete: true } });

    const parts = await partsPromise;
    expect(parts[0]).toEqual({
      type: 'stream-start',
      warnings: [
        {
          type: 'unsupported',
          feature: 'sourceLanguage',
          details:
            'The Gemini Live translation API auto-detects the source language and does not accept a source language.',
        },
        {
          type: 'unsupported',
          feature: 'outputAudioFormat',
          details:
            'The Gemini Live API always outputs 24kHz 16-bit PCM audio and does not accept an output audio format.',
        },
      ],
    });
  });

  it('should reject non-PCM input audio formats', async () => {
    const model = createModel();

    await expect(
      model.doStream({
        audio: convertArrayToReadableStream([new Uint8Array([1, 2, 3])]),
        inputAudioFormat: { type: 'audio/pcmu', rate: 8000 },
        targetLanguage: 'es',
      }),
    ).rejects.toThrow(
      'The Gemini Live translation API only supports 16kHz 16-bit PCM input audio.',
    );
  });

  it('should reject unsupported input audio sample rates', async () => {
    const model = createModel();

    await expect(
      model.doStream({
        audio: convertArrayToReadableStream([new Uint8Array([1, 2, 3])]),
        inputAudioFormat: { type: 'audio/pcm', rate: 24000 },
        targetLanguage: 'es',
      }),
    ).rejects.toThrow(
      'The Gemini Live translation API only supports 16kHz 16-bit PCM input audio.',
    );
  });

  it('should accumulate multiple turns before the audio ends', async () => {
    MockWebSocket.instances = [];
    const model = createModel();

    // an audio stream that stays open until we close it
    let audioController!: ReadableStreamDefaultController<Uint8Array>;
    const audio = new ReadableStream<Uint8Array>({
      start(controller) {
        audioController = controller;
        controller.enqueue(new Uint8Array([1, 2, 3]));
      },
    });

    const result = await model.doStream({
      audio,
      inputAudioFormat: { type: 'audio/pcm', rate: 16000 },
      targetLanguage: 'es',
    });

    const partsPromise = convertReadableStreamToArray(result.stream);
    const ws = MockWebSocket.instances[0];
    ws.open();
    ws.message({ setupComplete: {} });
    await flush();

    // first turn completes while audio is still streaming: no finish yet
    ws.message({
      serverContent: {
        inputTranscription: { text: 'Hello ' },
        outputTranscription: { text: 'Hola ' },
      },
    });
    ws.message({ serverContent: { turnComplete: true } });
    await flush();

    // audio ends; second turn completes and finishes the stream
    audioController.close();
    await flush();
    ws.message({
      serverContent: {
        inputTranscription: { text: 'world' },
        outputTranscription: { text: 'mundo' },
      },
    });
    ws.message({ serverContent: { turnComplete: true } });

    const parts = await partsPromise;
    expect(parts).toEqual([
      { type: 'stream-start', warnings: [] },
      {
        type: 'source-transcript-delta',
        id: 'google-item-0',
        delta: 'Hello ',
      },
      { type: 'output-text-delta', id: 'google-item-0', delta: 'Hola ' },
      {
        type: 'source-transcript-final',
        id: 'google-item-0',
        text: 'Hello ',
      },
      { type: 'output-text-final', id: 'google-item-0', text: 'Hola ' },
      { type: 'source-transcript-delta', id: 'google-item-1', delta: 'world' },
      { type: 'output-text-delta', id: 'google-item-1', delta: 'mundo' },
      { type: 'source-transcript-final', id: 'google-item-1', text: 'world' },
      { type: 'output-text-final', id: 'google-item-1', text: 'mundo' },
      {
        type: 'finish',
        sourceText: 'Hello world',
        outputText: 'Hola mundo',
        usage: undefined,
      },
    ]);
  });

  it('should include all turns that arrive after the audio ended early', async () => {
    MockWebSocket.instances = [];
    const model = createModel();

    // the shipped example sends all audio immediately: audioStreamEnd is set
    // before any server turn arrives
    const result = await model.doStream({
      audio: convertArrayToReadableStream([new Uint8Array([1, 2, 3])]),
      inputAudioFormat: { type: 'audio/pcm', rate: 16000 },
      targetLanguage: 'es',
    });

    const partsPromise = convertReadableStreamToArray(result.stream);
    const ws = MockWebSocket.instances[0];
    ws.open();
    ws.message({ setupComplete: {} });
    await flush();

    // audioStreamEnd has been sent; two turns follow
    expect(JSON.parse(ws.send.mock.calls[2][0])).toEqual({
      realtimeInput: { audioStreamEnd: true },
    });

    ws.message({
      serverContent: {
        inputTranscription: { text: 'Hello ' },
        outputTranscription: { text: 'Hola ' },
      },
    });
    ws.message({ serverContent: { turnComplete: true } });
    // second-turn activity cancels the pending finish: no truncation
    ws.message({
      serverContent: {
        inputTranscription: { text: 'world' },
        outputTranscription: { text: 'mundo' },
      },
    });
    ws.message({ serverContent: { turnComplete: true } });

    const parts = await partsPromise;
    expect(parts.at(-1)).toEqual({
      type: 'finish',
      sourceText: 'Hello world',
      outputText: 'Hola mundo',
      usage: undefined,
    });
    expect(parts.filter(part => part.type === 'output-text-final')).toEqual([
      { type: 'output-text-final', id: 'google-item-0', text: 'Hola ' },
      { type: 'output-text-final', id: 'google-item-1', text: 'mundo' },
    ]);
  });

  it('should finish without further server messages when the turn completed before the audio ended', async () => {
    MockWebSocket.instances = [];
    const model = createModel();

    let audioController!: ReadableStreamDefaultController<Uint8Array>;
    const audio = new ReadableStream<Uint8Array>({
      start(controller) {
        audioController = controller;
        controller.enqueue(new Uint8Array([1, 2, 3]));
      },
    });

    const result = await model.doStream({
      audio,
      inputAudioFormat: { type: 'audio/pcm', rate: 16000 },
      targetLanguage: 'es',
    });

    const partsPromise = convertReadableStreamToArray(result.stream);
    const ws = MockWebSocket.instances[0];
    ws.open();
    ws.message({ setupComplete: {} });
    await flush();

    // the turn completes while the input audio stream is still open
    ws.message({
      serverContent: {
        inputTranscription: { text: 'Hello' },
        outputTranscription: { text: 'Hola' },
      },
    });
    ws.message({ serverContent: { turnComplete: true } });
    await flush();

    // the audio then ends; the already-received turnComplete satisfies the
    // finish condition without any further server message (no hang)
    audioController.close();

    const parts = await partsPromise;
    expect(parts.at(-1)).toEqual({
      type: 'finish',
      sourceText: 'Hello',
      outputText: 'Hola',
      usage: undefined,
    });
  });

  it('should finish continuous translation after trailing output silence', async () => {
    MockWebSocket.instances = [];
    const model = createModel({ finishGraceMs: 500 });

    const result = await model.doStream({
      audio: convertArrayToReadableStream([new Uint8Array([1, 2, 3])]),
      inputAudioFormat: { type: 'audio/pcm', rate: 16000 },
      targetLanguage: 'es',
    });

    const partsPromise = convertReadableStreamToArray(result.stream);
    const ws = MockWebSocket.instances[0];
    ws.open();
    ws.message({ setupComplete: {} });
    await flush();

    ws.message({
      serverContent: {
        inputTranscription: { text: 'Hello' },
        outputTranscription: { text: 'Hola' },
      },
    });
    ws.message({
      serverContent: {
        modelTurn: {
          parts: [
            {
              inlineData: {
                data: convertUint8ArrayToBase64(new Uint8Array([1, 0])),
              },
            },
          ],
        },
      },
    });

    const silence = convertUint8ArrayToBase64(new Uint8Array(12_000));
    ws.message({
      serverContent: {
        modelTurn: { parts: [{ inlineData: { data: silence } }] },
      },
    });
    await flush();
    expect(ws.close).not.toHaveBeenCalled();

    ws.message({
      serverContent: {
        modelTurn: { parts: [{ inlineData: { data: silence } }] },
      },
    });

    const parts = await partsPromise;
    expect(parts.at(-3)).toEqual({
      type: 'source-transcript-final',
      id: 'google-item-0',
      text: 'Hello',
    });
    expect(parts.at(-2)).toEqual({
      type: 'output-text-final',
      id: 'google-item-0',
      text: 'Hola',
    });
    expect(parts.at(-1)).toEqual({
      type: 'finish',
      sourceText: 'Hello',
      outputText: 'Hola',
      usage: undefined,
    });
  });

  it('should parse a real Google Live translation response', async () => {
    MockWebSocket.instances = [];
    const model = createModel();

    const result = await model.doStream({
      audio: convertArrayToReadableStream([new Uint8Array([1, 2, 3])]),
      inputAudioFormat: { type: 'audio/pcm', rate: 16000 },
      targetLanguage: 'es',
    });

    const partsPromise = convertReadableStreamToArray(result.stream);
    const ws = MockWebSocket.instances[0];
    const messages = readFixture('google-live-speech-translation.chunks.txt');
    ws.open();
    ws.message(messages[0]);
    await flush();

    for (const message of messages.slice(1)) {
      ws.message(message);
    }

    const parts = await partsPromise;
    expect(parts.filter(part => part.type === 'audio')).toEqual([
      { type: 'audio', id: 'google-item-0', audio: 'AQIDBAUGBwg=' },
      { type: 'audio', id: 'google-item-0', audio: 'AAAAAAAAAAAAAAAA' },
    ]);
    expect(parts.at(-3)).toEqual({
      type: 'source-transcript-final',
      id: 'google-item-0',
      text: 'The quick brown fox jumps over the lazy dog.',
    });
    expect(parts.at(-2)).toEqual({
      type: 'output-text-final',
      id: 'google-item-0',
      text: 'El zorro marrón rápido salta sobre el perro perezoso.',
    });
    expect(parts.at(-1)).toEqual({
      type: 'finish',
      sourceText: 'The quick brown fox jumps over the lazy dog.',
      outputText: 'El zorro marrón rápido salta sobre el perro perezoso.',
      usage: {
        inputAudioTokens: 150,
        outputAudioTokens: 150,
      },
    });
  });

  it('should finish when the server closes while a finish is pending', async () => {
    MockWebSocket.instances = [];

    // grace period > 0 so the pending finish is still scheduled at close time
    const graceModel = new GoogleSpeechTranslationModel(
      'gemini-3.5-live-translate-preview',
      {
        provider: 'test-provider',
        baseURL: 'https://generativelanguage.googleapis.com/v1beta',
        headers: () => ({ 'x-goog-api-key': 'test-api-key' }),
        webSocket: MockWebSocket,
        _internal: { finishGraceMs: 10_000 },
      },
    );

    const result = await graceModel.doStream({
      audio: convertArrayToReadableStream([new Uint8Array([1, 2, 3])]),
      inputAudioFormat: { type: 'audio/pcm', rate: 16000 },
      targetLanguage: 'es',
    });

    const partsPromise = convertReadableStreamToArray(result.stream);
    const ws = MockWebSocket.instances[0];
    ws.open();
    ws.message({ setupComplete: {} });
    await flush();

    ws.message({ serverContent: { outputTranscription: { text: 'Hola' } } });
    ws.message({ serverContent: { turnComplete: true } });
    await flush();

    // close while the grace-period finish is pending confirms completion:
    ws.serverClose(1000, '');

    const parts = await partsPromise;
    expect(parts.at(-1)).toEqual({
      type: 'finish',
      sourceText: '',
      outputText: 'Hola',
      usage: undefined,
    });
  });

  it('should error the stream with close diagnostics when the socket closes before finishing', async () => {
    MockWebSocket.instances = [];
    const model = createModel();

    const result = await model.doStream({
      audio: convertArrayToReadableStream([new Uint8Array([1, 2, 3])]),
      inputAudioFormat: { type: 'audio/pcm', rate: 16000 },
      targetLanguage: 'es',
    });

    const partsPromise = convertReadableStreamToArray(result.stream);
    const ws = MockWebSocket.instances[0];
    ws.open();
    ws.message({ setupComplete: {} });
    await flush();

    ws.message({ serverContent: { outputTranscription: { text: 'Ho' } } });
    ws.serverClose(1011, 'internal server error');

    await expect(partsPromise).rejects.toThrow(
      'Google Live translation WebSocket closed unexpectedly before finishing (code 1011, reason: internal server error).',
    );
  });

  it('should error the stream when the abort signal fires mid-stream', async () => {
    MockWebSocket.instances = [];
    const model = createModel();
    const abortController = new AbortController();

    const result = await model.doStream({
      audio: convertArrayToReadableStream([new Uint8Array([1, 2, 3])]),
      inputAudioFormat: { type: 'audio/pcm', rate: 16000 },
      targetLanguage: 'es',
      abortSignal: abortController.signal,
    });

    const partsPromise = convertReadableStreamToArray(result.stream);
    const ws = MockWebSocket.instances[0];
    ws.open();
    ws.message({ setupComplete: {} });
    await flush();

    ws.message({ serverContent: { outputTranscription: { text: 'Ho' } } });
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
      inputAudioFormat: { type: 'audio/pcm', rate: 16000 },
      targetLanguage: 'es',
    });

    const partsPromise = convertReadableStreamToArray(result.stream);
    const ws = MockWebSocket.instances[0];
    ws.open();
    ws.message({ setupComplete: {} });
    await flush();

    ws.message({ serverContent: { outputTranscription: { text: 'Hola' } } });
    ws.message({ serverContent: { turnComplete: true } });

    const parts = await partsPromise;
    expect(parts.at(-1)?.type).toBe('finish');

    // post-finish messages are a no-op (no throw, no new parts):
    ws.message({ serverContent: { outputTranscription: { text: 'late' } } });
    ws.message({ serverContent: { turnComplete: true } });
    await flush();
    expect(parts).toHaveLength(4);
  });

  it('should include raw provider chunks when includeRawChunks is enabled', async () => {
    MockWebSocket.instances = [];
    const model = createModel();

    const result = await model.doStream({
      audio: convertArrayToReadableStream([new Uint8Array([1, 2, 3])]),
      inputAudioFormat: { type: 'audio/pcm', rate: 16000 },
      targetLanguage: 'es',
      includeRawChunks: true,
    });

    const partsPromise = convertReadableStreamToArray(result.stream);
    const ws = MockWebSocket.instances[0];
    ws.open();
    ws.message({ setupComplete: {} });
    await flush();

    ws.message({
      serverContent: { outputTranscription: { text: 'Hola' } },
    });
    ws.message({ serverContent: { turnComplete: true } });

    const parts = await partsPromise;
    expect(parts.filter(part => part.type === 'raw')).toEqual([
      { type: 'raw', rawValue: { setupComplete: {} } },
      {
        type: 'raw',
        rawValue: { serverContent: { outputTranscription: { text: 'Hola' } } },
      },
      { type: 'raw', rawValue: { serverContent: { turnComplete: true } } },
    ]);
  });

  it('should throw when no API key is available', async () => {
    const model = createModel({ headers: () => ({}) });

    await expect(
      model.doStream({
        audio: convertArrayToReadableStream([new Uint8Array([1, 2, 3])]),
        inputAudioFormat: { type: 'audio/pcm', rate: 16000 },
        targetLanguage: 'es',
      }),
    ).rejects.toThrow(
      'Google Generative AI API key is required for streaming translation.',
    );
  });

  it('should find the API key with case-insensitive header lookup', async () => {
    MockWebSocket.instances = [];
    const model = createModel({
      headers: () => ({ 'X-Goog-Api-Key': 'case-insensitive-key' }),
    });

    const result = await model.doStream({
      audio: convertArrayToReadableStream([new Uint8Array([1, 2, 3])]),
      inputAudioFormat: { type: 'audio/pcm', rate: 16000 },
      targetLanguage: 'es',
    });

    void result.stream.cancel();
    const ws = MockWebSocket.instances[0];
    expect(ws.url.toString()).toContain('key=case-insensitive-key');
    expect(ws.options?.headers).toEqual({});
  });

  it('should pass non-credential headers to the WebSocket constructor', async () => {
    MockWebSocket.instances = [];
    const model = createModel({
      headers: () => ({
        'x-goog-api-key': 'test-api-key',
        'Custom-Header': 'custom-value',
      }),
    });

    const result = await model.doStream({
      audio: convertArrayToReadableStream([new Uint8Array([1, 2, 3])]),
      inputAudioFormat: { type: 'audio/pcm', rate: 16000 },
      targetLanguage: 'es',
    });

    void result.stream.cancel();
    const ws = MockWebSocket.instances[0];
    expect(ws.options?.headers).toEqual({
      'Custom-Header': 'custom-value',
    });
  });

  it('should error the stream on server error messages', async () => {
    MockWebSocket.instances = [];
    const model = createModel();

    const result = await model.doStream({
      audio: convertArrayToReadableStream([new Uint8Array([1, 2, 3])]),
      inputAudioFormat: { type: 'audio/pcm', rate: 16000 },
      targetLanguage: 'es',
    });

    const partsPromise = convertReadableStreamToArray(result.stream);
    const ws = MockWebSocket.instances[0];
    ws.open();
    await flush();

    ws.message({ error: { message: 'invalid target language' } });

    await expect(partsPromise).rejects.toThrow('invalid target language');
  });

  it('should cancel the audio stream when the WebSocket constructor throws', async () => {
    let audioCancelled = false;
    const audio = new ReadableStream<Uint8Array>({
      cancel() {
        audioCancelled = true;
      },
    });
    const model = new GoogleSpeechTranslationModel(
      'gemini-3.5-live-translate-preview',
      {
        provider: 'test-provider',
        baseURL: 'https://generativelanguage.googleapis.com/v1beta',
        headers: () => ({ 'x-goog-api-key': 'test-api-key' }),
        webSocket: class {
          constructor() {
            throw new Error('constructor failed');
          }
        } as never,
      },
    );

    const result = await model.doStream({
      audio,
      inputAudioFormat: { type: 'audio/pcm', rate: 16000 },
      targetLanguage: 'es',
    });

    await expect(convertReadableStreamToArray(result.stream)).rejects.toThrow(
      'constructor failed',
    );
    expect(audioCancelled).toBe(true);
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
      inputAudioFormat: { type: 'audio/pcm', rate: 16000 },
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

  it('should be created by the provider translation factory', async () => {
    MockWebSocket.instances = [];
    const provider = createGoogle({
      apiKey: 'test-api-key',
      webSocket: MockWebSocket,
    });

    const model = provider.translation('gemini-3.5-live-translate-preview');
    expect(model.provider).toBe('google.generative-ai.speech-translation');
    expect(model.modelId).toBe('gemini-3.5-live-translate-preview');

    const result = await model.doStream({
      audio: convertArrayToReadableStream([new Uint8Array([1, 2, 3])]),
      inputAudioFormat: { type: 'audio/pcm', rate: 16000 },
      targetLanguage: 'es',
    });

    void result.stream.cancel();
    const ws = MockWebSocket.instances[0];
    expect(ws.url.toString()).toContain('key=test-api-key');
  });
});
