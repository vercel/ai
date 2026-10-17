import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import {
  convertArrayToReadableStream,
  convertReadableStreamToArray,
} from '@ai-sdk/provider-utils/test';
import { DeepgramTranscriptionModel } from './deepgram-transcription-model';
import { createDeepgram } from './deepgram-provider';
import { readFile } from 'node:fs/promises';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./version', () => ({
  VERSION: '0.0.0-test',
}));

const audioData = await readFile(path.join(__dirname, 'transcript-test.mp3'));
const provider = createDeepgram({ apiKey: 'test-api-key' });
const model = provider.transcription('nova-3');

const server = createTestServer({
  'https://api.deepgram.com/v1/listen': {},
});

function prepareJsonFixtureResponse(
  filename: string,
  headers?: Record<string, string>,
) {
  server.urls['https://api.deepgram.com/v1/listen'].response = {
    type: 'json-value',
    headers,
    body: JSON.parse(
      fs.readFileSync(`src/__fixtures__/${filename}.json`, 'utf8'),
    ),
  };
}

describe('doGenerate', () => {
  describe('transcription', () => {
    beforeEach(() => prepareJsonFixtureResponse('deepgram-transcription'));

    it('should pass the model', async () => {
      await model.doGenerate({
        audio: audioData,
        mediaType: 'audio/wav',
      });

      expect(await server.calls[0].requestBodyMultipart).toMatchObject({});
    });

    it('should pass headers', async () => {
      const provider = createDeepgram({
        apiKey: 'test-api-key',
        headers: {
          'Custom-Provider-Header': 'provider-header-value',
        },
      });

      await provider.transcription('nova-3').doGenerate({
        audio: audioData,
        mediaType: 'audio/wav',
        headers: {
          'Custom-Request-Header': 'request-header-value',
        },
      });

      expect(server.calls[0].requestHeaders).toMatchObject({
        authorization: 'Token test-api-key',
        'content-type': 'audio/wav',
        'custom-provider-header': 'provider-header-value',
        'custom-request-header': 'request-header-value',
      });
      expect(server.calls[0].requestUserAgent).toContain(
        `ai-sdk-deepgram/0.0.0-test`,
      );
    });

    it('should extract the transcription text', async () => {
      const result = await model.doGenerate({
        audio: audioData,
        mediaType: 'audio/wav',
      });

      expect(result.text).toMatchInlineSnapshot(
        `"galileo was an american robotic space program that studied the planet jupiter and its moons as well as several other solar system bodies named after the italian astronomer galileo galilei the galileo spacecraft consisted of an orbiter and an atmospheric entry probe it was delivered into earth orbit on october eighteen nineteen eighty nine by space shuttle atlantis on the sts-thirty four mission and arrived at jupiter on december seven nineteen ninety five after gravity assist flybys of venus and earth and became the first spacecraft to orbit jupiter"`,
      );
    });

    it('should return audio duration as usage in seconds', async () => {
      const result = await model.doGenerate({
        audio: audioData,
        mediaType: 'audio/wav',
      });

      expect(result.usage).toStrictEqual({ seconds: 36.744 });
    });

    it('should pass detectLanguage as detect_language query parameter', async () => {
      await model.doGenerate({
        audio: audioData,
        mediaType: 'audio/wav',
        providerOptions: {
          deepgram: {
            detectLanguage: true,
          },
        },
      });

      const requestUrl = server.calls[0].requestUrl;
      expect(requestUrl).toContain('detect_language=true');
    });

    it('should return detected language from response', async () => {
      const result = await model.doGenerate({
        audio: audioData,
        mediaType: 'audio/wav',
        providerOptions: {
          deepgram: {
            detectLanguage: true,
          },
        },
      });

      expect(result.language).toBe('en');
    });

    it('should not send diarize by default', async () => {
      await model.doGenerate({
        audio: audioData,
        mediaType: 'audio/wav',
      });

      const requestUrl = server.calls[0].requestUrl;
      expect(requestUrl).not.toContain('diarize');
    });

    it('should pass diarize when explicitly enabled', async () => {
      await model.doGenerate({
        audio: audioData,
        mediaType: 'audio/wav',
        providerOptions: {
          deepgram: {
            diarize: true,
          },
        },
      });

      const requestUrl = server.calls[0].requestUrl;
      expect(requestUrl).toContain('diarize=true');
    });

    it('should pass keyterm, paragraphs, intents, sentiment, and replace as query parameters', async () => {
      await model.doGenerate({
        audio: audioData,
        mediaType: 'audio/wav',
        providerOptions: {
          deepgram: {
            keyterm: 'galileo',
            paragraphs: true,
            intents: true,
            sentiment: true,
            redact: 'numbers',
            replace: '[redacted]',
          },
        },
      });

      const url = new URL(server.calls[0].requestUrl);
      expect(url.searchParams.get('keyterm')).toBe('galileo');
      expect(url.searchParams.get('paragraphs')).toBe('true');
      expect(url.searchParams.get('intents')).toBe('true');
      expect(url.searchParams.get('sentiment')).toBe('true');
      expect(url.searchParams.get('redact')).toBe('numbers');
      expect(url.searchParams.get('replace')).toBe('[redacted]');
    });
  });

  describe('response headers', () => {
    it('should include response data with timestamp, modelId and headers', async () => {
      prepareJsonFixtureResponse('deepgram-transcription', {
        'x-request-id': 'test-request-id',
        'x-ratelimit-remaining': '123',
      });

      const testDate = new Date(0);
      const customModel = new DeepgramTranscriptionModel('nova-3', {
        provider: 'test-provider',
        url: () => 'https://api.deepgram.com/v1/listen',
        headers: () => ({}),
        _internal: {
          currentDate: () => testDate,
        },
      });

      const result = await customModel.doGenerate({
        audio: audioData,
        mediaType: 'audio/wav',
      });

      expect(result.response).toMatchSnapshot();
    });
  });

  describe('response metadata', () => {
    it('should use real date when no custom date provider is specified', async () => {
      prepareJsonFixtureResponse('deepgram-transcription');

      const testDate = new Date(0);
      const customModel = new DeepgramTranscriptionModel('nova-3', {
        provider: 'test-provider',
        url: () => 'https://api.deepgram.com/v1/listen',
        headers: () => ({}),
        _internal: {
          currentDate: () => testDate,
        },
      });

      const result = await customModel.doGenerate({
        audio: audioData,
        mediaType: 'audio/wav',
      });

      expect(result.response.timestamp.getTime()).toEqual(testDate.getTime());
      expect(result.response.modelId).toBe('nova-3');
    });
  });

  describe('language detection', () => {
    it('should return detected language from inline response', async () => {
      server.urls['https://api.deepgram.com/v1/listen'].response = {
        type: 'json-value',
        body: {
          metadata: { duration: 1.0 },
          results: {
            channels: [
              {
                detected_language: 'sv',
                alternatives: [{ transcript: 'hej', words: [] }],
              },
            ],
          },
        },
      };

      const result = await model.doGenerate({
        audio: audioData,
        mediaType: 'audio/wav',
        providerOptions: {
          deepgram: {
            detectLanguage: true,
          },
        },
      });

      expect(result.language).toBe('sv');
    });

    it('should return undefined language when not detected', async () => {
      server.urls['https://api.deepgram.com/v1/listen'].response = {
        type: 'json-value',
        body: {
          metadata: { duration: 1.0 },
          results: {
            channels: [
              {
                alternatives: [{ transcript: 'hello', words: [] }],
              },
            ],
          },
        },
      };

      const result = await model.doGenerate({
        audio: audioData,
        mediaType: 'audio/wav',
      });

      expect(result.language).toBeUndefined();
    });
  });
});

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

describe('doStream', () => {
  const streamingProvider = createDeepgram({
    apiKey: 'test-api-key',
    webSocket: MockWebSocket,
  });

  beforeEach(() => {
    MockWebSocket.instances = [];
  });

  it('streams interim and final transcripts over WebSocket', async () => {
    const testDate = new Date(0);
    const model = new DeepgramTranscriptionModel('nova-3', {
      provider: 'deepgram.transcription',
      url: ({ path }) => `https://api.deepgram.com${path}`,
      headers: () => ({ authorization: 'Token test-api-key' }),
      webSocket: MockWebSocket,
      _internal: { currentDate: () => testDate },
    });

    const result = await model.doStream({
      audio: convertArrayToReadableStream([new Uint8Array([1, 2, 3])]),
      inputAudioFormat: { type: 'audio/pcm', rate: 16000 },
      providerOptions: {
        deepgram: {
          language: 'en',
          smartFormat: true,
          streaming: { endpointing: 300 },
        },
      },
    });

    const partsPromise = convertReadableStreamToArray(result.stream);
    const ws = MockWebSocket.instances[0];
    expect(ws.url.toString()).toBe(
      'wss://api.deepgram.com/v1/listen?model=nova-3&language=en&smart_format=true&encoding=linear16&sample_rate=16000&interim_results=true&endpointing=300',
    );
    expect(ws.protocols).toEqual(['token', 'test-api-key']);
    expect(ws.options).toEqual({ headers: {} });

    ws.open();
    await flush();
    expect(ws.send).toHaveBeenNthCalledWith(1, new Uint8Array([1, 2, 3]));
    expect(JSON.parse(ws.send.mock.calls[1][0])).toEqual({
      type: 'CloseStream',
    });

    ws.message({
      type: 'Results',
      start: 0,
      duration: 0.5,
      is_final: false,
      channel: { alternatives: [{ transcript: 'hello', words: [] }] },
    });
    ws.message({
      type: 'Results',
      start: 0,
      duration: 1.25,
      is_final: true,
      channel: {
        alternatives: [
          {
            transcript: 'Hello world.',
            words: [
              { word: 'hello', start: 0.1, end: 0.5 },
              { word: 'world', start: 0.6, end: 1.1 },
            ],
          },
        ],
      },
    });
    ws.message({
      type: 'Results',
      start: 1.25,
      duration: 0.75,
      is_final: true,
      channel: { alternatives: [{ transcript: '', words: [] }] },
    });
    ws.message({ type: 'Metadata', request_id: 'request-1', duration: 2 });

    await expect(partsPromise).resolves.toEqual([
      { type: 'stream-start', warnings: [] },
      {
        type: 'transcript-partial',
        text: 'hello',
        startSecond: 0,
        durationInSeconds: 0.5,
      },
      {
        type: 'transcript-final',
        text: 'Hello world.',
        startSecond: 0,
        endSecond: 1.25,
      },
      {
        type: 'transcript-final',
        text: '',
        startSecond: 1.25,
        endSecond: 2,
      },
      {
        type: 'finish',
        text: 'Hello world.',
        segments: [
          { text: 'hello', startSecond: 0.1, endSecond: 0.5 },
          { text: 'world', startSecond: 0.6, endSecond: 1.1 },
        ],
        language: 'en',
        durationInSeconds: 2,
        usage: { seconds: 2 },
      },
    ]);
    expect(ws.close).toHaveBeenCalledWith(1000);
    expect(result.request).toEqual({ body: ws.url.toString() });
    expect(result.response).toEqual({
      timestamp: testDate,
      modelId: 'nova-3',
    });
  });

  it('drops pre-recorded-only options with warnings and honors streaming options', async () => {
    const result = await streamingProvider.transcription('nova-3').doStream!({
      audio: convertArrayToReadableStream([]),
      inputAudioFormat: { type: 'audio/pcmu' },
      providerOptions: {
        deepgram: {
          summarize: 'v2',
          uttSplit: 0.8,
          sentiment: false,
          diarize: true,
          streaming: { interimResults: false, endpointing: false },
        },
      },
    });

    const ws = MockWebSocket.instances[0];
    expect(new URL(ws.url).search).toBe(
      '?model=nova-3&diarize=true&encoding=mulaw&sample_rate=8000&interim_results=false&endpointing=false',
    );

    ws.open();
    const reader = result.stream.getReader();
    expect((await reader.read()).value).toEqual({
      type: 'stream-start',
      warnings: [
        {
          type: 'unsupported',
          feature: 'providerOptions.deepgram.summarize',
          details:
            'Deepgram streaming transcription does not support summarize.',
        },
        {
          type: 'unsupported',
          feature: 'providerOptions.deepgram.uttSplit',
          details:
            'Deepgram streaming transcription does not support uttSplit.',
        },
      ],
    });
    await reader.cancel();
  });

  it('passes per-call headers and keeps the API key in the subprotocol', async () => {
    const result = await streamingProvider.transcription('nova-3').doStream!({
      audio: convertArrayToReadableStream([]),
      inputAudioFormat: { type: 'audio/pcm', rate: 24000 },
      headers: {
        'Custom-Request-Header': 'request-header-value',
      },
    });

    const ws = MockWebSocket.instances[0];
    expect(ws.protocols).toEqual(['token', 'test-api-key']);
    expect(ws.options).toEqual({
      headers: {
        'Custom-Request-Header': 'request-header-value',
        'user-agent': 'ai-sdk-deepgram/0.0.0-test',
      },
    });
    await result.stream.cancel();
  });

  it('rejects audio formats that Deepgram streaming cannot decode', async () => {
    await expect(
      streamingProvider.transcription('nova-3').doStream!({
        audio: convertArrayToReadableStream([]),
        inputAudioFormat: { type: 'audio/wav' },
      }),
    ).rejects.toMatchObject({
      name: 'AI_InvalidArgumentError',
      message:
        'Unsupported Deepgram streaming audio format: audio/wav. Use audio/pcm, audio/pcmu, or audio/pcma.',
    });
    expect(MockWebSocket.instances).toHaveLength(0);
  });

  it('errors when the socket closes before Deepgram sends Metadata', async () => {
    const result = await streamingProvider.transcription('nova-3').doStream!({
      audio: convertArrayToReadableStream([new Uint8Array([1])]),
      inputAudioFormat: { type: 'audio/pcm', rate: 16000 },
    });
    const partsPromise = convertReadableStreamToArray(result.stream);
    const ws = MockWebSocket.instances[0];

    ws.open();
    await flush();
    ws.serverClose(1011, 'NET-0001');

    await expect(partsPromise).rejects.toThrow(
      'Deepgram streaming transcription closed before completion (code 1011: NET-0001).',
    );
  });

  it('streams a Deepgram Error message as an error part and keeps the stream open', async () => {
    const result = await streamingProvider.transcription('nova-3').doStream!({
      audio: convertArrayToReadableStream([new Uint8Array([1])]),
      inputAudioFormat: { type: 'audio/pcm', rate: 16000 },
    });
    const partsPromise = convertReadableStreamToArray(result.stream);
    const ws = MockWebSocket.instances[0];

    ws.open();
    await flush();
    ws.message({
      type: 'Error',
      variant: 'SchemaError',
      description: 'Invalid control message.',
      message: '{"type":"Unknown"}',
    });
    ws.message({
      type: 'Results',
      start: 0,
      duration: 1,
      is_final: true,
      channel: { alternatives: [{ transcript: 'Still here.', words: [] }] },
    });
    ws.message({ type: 'Metadata', duration: 1 });

    await expect(partsPromise).resolves.toEqual([
      { type: 'stream-start', warnings: [] },
      { type: 'error', error: new Error('Invalid control message.') },
      {
        type: 'transcript-final',
        text: 'Still here.',
        startSecond: 0,
        endSecond: 1,
      },
      {
        type: 'finish',
        text: 'Still here.',
        segments: [],
        language: undefined,
        durationInSeconds: 1,
        usage: { seconds: 1 },
      },
    ]);
  });

  it('closes the WebSocket and stops reading audio when cancelled', async () => {
    let audioCancelled = false;
    const audio = new ReadableStream<Uint8Array>({
      cancel() {
        audioCancelled = true;
      },
    });
    const result = await streamingProvider.transcription('nova-3').doStream!({
      audio,
      inputAudioFormat: { type: 'audio/pcm', rate: 16000 },
    });
    const ws = MockWebSocket.instances[0];
    ws.open();
    await flush();

    await result.stream.cancel();
    await flush();

    expect(ws.close).toHaveBeenCalled();
    expect(audioCancelled).toBe(true);
  });
});
