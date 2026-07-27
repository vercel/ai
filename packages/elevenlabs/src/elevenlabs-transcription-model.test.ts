import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import {
  convertArrayToReadableStream,
  convertReadableStreamToArray,
} from '@ai-sdk/provider-utils/test';
import { UnsupportedFunctionalityError } from '@ai-sdk/provider';
import { ElevenLabsTranscriptionModel } from './elevenlabs-transcription-model';
import { createElevenLabs } from './elevenlabs-provider';
import { readFile } from 'node:fs/promises';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./version', () => ({
  VERSION: '0.0.0-test',
}));

const audioData = await readFile(path.join(__dirname, 'transcript-test.mp3'));
const provider = createElevenLabs({ apiKey: 'test-api-key' });
const model = provider.transcription('scribe_v1');

const server = createTestServer({
  'https://api.elevenlabs.io/v1/speech-to-text': {},
});

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

  remoteClose() {
    this.readyState = 3;
    this.onclose?.({});
  }

  error() {
    this.onerror?.({});
  }
}

const flush = () => new Promise(resolve => setTimeout(resolve, 0));

function prepareJsonFixtureResponse(
  filename: string,
  headers?: Record<string, string>,
) {
  server.urls['https://api.elevenlabs.io/v1/speech-to-text'].response = {
    type: 'json-value',
    headers,
    body: JSON.parse(
      fs.readFileSync(`src/__fixtures__/${filename}.json`, 'utf8'),
    ),
  };
}

describe('doGenerate', () => {
  it('should reject scribe_v2_realtime for non-streaming transcription', async () => {
    await expect(
      provider.transcription('scribe_v2_realtime').doGenerate({
        audio: audioData,
        mediaType: 'audio/wav',
      }),
    ).rejects.toBeInstanceOf(UnsupportedFunctionalityError);
  });

  it('warns when streaming options are passed to batch transcription', async () => {
    prepareJsonFixtureResponse('elevenlabs-transcription');

    const result = await model.doGenerate({
      audio: audioData,
      mediaType: 'audio/wav',
      providerOptions: {
        elevenlabs: {
          streaming: { includeTimestamps: true },
        },
      },
    });

    expect(result.warnings).toEqual([
      {
        type: 'unsupported',
        feature: 'providerOptions.elevenlabs.streaming',
        details:
          'ElevenLabs batch transcription does not support streaming options.',
      },
    ]);
  });

  describe('transcription', () => {
    beforeEach(() => prepareJsonFixtureResponse('elevenlabs-transcription'));

    it('should pass the model', async () => {
      await model.doGenerate({
        audio: audioData,
        mediaType: 'audio/wav',
      });

      expect(await server.calls[0].requestBodyMultipart).toMatchObject({
        model_id: 'scribe_v1',
      });
    });

    it('should pass headers', async () => {
      const provider = createElevenLabs({
        apiKey: 'test-api-key',
        headers: {
          'Custom-Provider-Header': 'provider-header-value',
        },
      });

      await provider.transcription('scribe_v1').doGenerate({
        audio: audioData,
        mediaType: 'audio/wav',
        headers: {
          'Custom-Request-Header': 'request-header-value',
        },
      });

      expect(server.calls[0].requestHeaders).toMatchObject({
        'xi-api-key': 'test-api-key',
        'content-type': expect.stringMatching(
          /^multipart\/form-data; boundary=----formdata-undici-\d+$/,
        ),
        'custom-provider-header': 'provider-header-value',
        'custom-request-header': 'request-header-value',
      });
      expect(server.calls[0].requestUserAgent).toContain(
        `ai-sdk/elevenlabs/0.0.0-test`,
      );
    });

    it('should extract the transcription text', async () => {
      const result = await model.doGenerate({
        audio: audioData,
        mediaType: 'audio/wav',
      });

      expect(result.text).toMatchInlineSnapshot(
        `"Hello from the Vercel AI SDK."`,
      );
    });

    it('should pass provider options correctly', async () => {
      await model.doGenerate({
        audio: audioData,
        mediaType: 'audio/wav',
        providerOptions: {
          elevenlabs: {
            languageCode: 'en',
            fileFormat: 'pcm_s16le_16',
            tagAudioEvents: false,
            numSpeakers: 2,
            timestampsGranularity: 'character',
            diarize: true,
          },
        },
      });

      const body = await server.calls[0].requestBodyMultipart;
      expect(body!.file).toBeInstanceOf(File);
      const { file: _, ...rest } = body!;
      expect(rest).toMatchInlineSnapshot(`
        {
          "diarize": "true",
          "file_format": "pcm_s16le_16",
          "language_code": "en",
          "model_id": "scribe_v1",
          "num_speakers": "2",
          "tag_audio_events": "false",
          "timestamps_granularity": "character",
        }
      `);
    });
  });

  describe('response headers', () => {
    it('should include response data with timestamp, modelId and headers', async () => {
      prepareJsonFixtureResponse('elevenlabs-transcription', {
        'x-request-id': 'test-request-id',
        'x-ratelimit-remaining': '123',
      });

      const testDate = new Date(0);
      const customModel = new ElevenLabsTranscriptionModel('scribe_v1', {
        provider: 'test-provider',
        url: () => 'https://api.elevenlabs.io/v1/speech-to-text',
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
      prepareJsonFixtureResponse('elevenlabs-transcription');

      const testDate = new Date(0);
      const customModel = new ElevenLabsTranscriptionModel('scribe_v1', {
        provider: 'test-provider',
        url: () => 'https://api.elevenlabs.io/v1/speech-to-text',
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
      expect(result.response.modelId).toBe('scribe_v1');
    });
  });

  describe('no additional formats', () => {
    it('should work when no additional formats are returned', async () => {
      prepareJsonFixtureResponse('elevenlabs-transcription');

      const testDate = new Date(0);
      const customModel = new ElevenLabsTranscriptionModel('scribe_v1', {
        provider: 'test-provider',
        url: () => 'https://api.elevenlabs.io/v1/speech-to-text',
        headers: () => ({}),
        _internal: {
          currentDate: () => testDate,
        },
      });

      const result = await customModel.doGenerate({
        audio: audioData,
        mediaType: 'audio/wav',
      });

      expect(result).toMatchSnapshot();
    });
  });
});

describe('doStream', () => {
  beforeEach(() => {
    MockWebSocket.instances = [];
  });

  it('streams Scribe v2 Realtime and maps partial, committed, and timestamped output', async () => {
    const testDate = new Date(0);
    const model = new ElevenLabsTranscriptionModel('scribe_v2_realtime', {
      provider: 'test-provider',
      url: ({ path }) => `https://api.elevenlabs.io${path}`,
      headers: () => ({
        'xi-api-key': 'test-api-key',
        'Custom-Provider-Header': 'provider-value',
      }),
      webSocket: MockWebSocket,
      _internal: { currentDate: () => testDate },
    });

    const result = await model.doStream({
      audio: convertArrayToReadableStream([new Uint8Array([1, 2, 3]), 'BAUG']),
      inputAudioFormat: { type: 'audio/pcm', rate: 16000 },
      headers: { 'Custom-Request-Header': 'request-value' },
      providerOptions: {
        elevenlabs: {
          languageCode: 'en',
          streaming: {
            commitStrategy: 'manual',
            enableLogging: false,
            includeLanguageDetection: true,
            includeTimestamps: true,
            keyterms: ['Vercel', 'AI SDK'],
            minSilenceDurationMs: 200,
            minSpeechDurationMs: 150,
            noVerbatim: true,
            previousText: 'Earlier context',
            secondaryLanguages: ['es', 'fr'],
            vadSilenceThresholdSecs: 1.2,
            vadThreshold: 0.5,
          },
        },
      },
    });

    const partsPromise = convertReadableStreamToArray(result.stream);
    const ws = MockWebSocket.instances[0];
    const url = new URL(ws.url);
    expect(url.origin + url.pathname).toBe(
      'wss://api.elevenlabs.io/v1/speech-to-text/realtime',
    );
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      audio_format: 'pcm_16000',
      commit_strategy: 'manual',
      enable_logging: 'false',
      include_language_detection: 'true',
      include_timestamps: 'true',
      language_code: 'en',
      min_silence_duration_ms: '200',
      min_speech_duration_ms: '150',
      model_id: 'scribe_v2_realtime',
      no_verbatim: 'true',
      vad_silence_threshold_secs: '1.2',
      vad_threshold: '0.5',
    });
    expect(url.searchParams.getAll('keyterms')).toEqual(['Vercel', 'AI SDK']);
    expect(url.searchParams.getAll('secondary_languages')).toEqual([
      'es',
      'fr',
    ]);
    expect(ws.options?.headers).toMatchObject({
      'xi-api-key': 'test-api-key',
      'Custom-Provider-Header': 'provider-value',
      'Custom-Request-Header': 'request-value',
    });

    ws.open();
    ws.message({
      message_type: 'session_started',
      session_id: 'session-1',
      config: {},
    });
    await flush();

    expect(ws.send.mock.calls.map(([value]) => JSON.parse(value))).toEqual([
      {
        message_type: 'input_audio_chunk',
        audio_base_64: 'AQID',
        commit: false,
        sample_rate: 16000,
        previous_text: 'Earlier context',
      },
      {
        message_type: 'input_audio_chunk',
        audio_base_64: 'BAUG',
        commit: false,
        sample_rate: 16000,
      },
      {
        message_type: 'input_audio_chunk',
        audio_base_64: '',
        commit: true,
        sample_rate: 16000,
      },
    ]);

    ws.message({ message_type: 'partial_transcript', text: 'Hello wor' });
    ws.message({
      message_type: 'committed_transcript',
      text: 'Hello world.',
    });
    ws.message({
      message_type: 'committed_transcript_with_timestamps',
      text: 'Hello world.',
      language_code: 'en',
      words: [
        { text: 'Hello', start: 0, end: 0.4, type: 'word' },
        { text: ' ', start: 0.4, end: 0.45, type: 'spacing' },
        { text: 'world.', start: 0.45, end: 0.9, type: 'word' },
      ],
    });

    await expect(partsPromise).resolves.toEqual([
      { type: 'stream-start', warnings: [] },
      {
        type: 'transcript-partial',
        id: 'session-1:0',
        text: 'Hello wor',
      },
      {
        type: 'transcript-final',
        id: 'session-1:0',
        text: 'Hello world.',
      },
      {
        type: 'finish',
        text: 'Hello world.',
        segments: [
          { text: 'Hello', startSecond: 0, endSecond: 0.4 },
          { text: ' ', startSecond: 0.4, endSecond: 0.45 },
          { text: 'world.', startSecond: 0.45, endSecond: 0.9 },
        ],
        language: 'en',
        durationInSeconds: 0.9,
      },
    ]);
    expect(result.response).toEqual({
      timestamp: testDate,
      modelId: 'scribe_v2_realtime',
    });
    expect(ws.close).toHaveBeenCalledWith(1000);
  });

  it('detects language without returning timestamps unless requested', async () => {
    const result = await createElevenLabs({
      apiKey: 'test-api-key',
      webSocket: MockWebSocket,
    }).transcription('scribe_v2_realtime').doStream!({
      audio: convertArrayToReadableStream([new Uint8Array([1])]),
      inputAudioFormat: { type: 'audio/pcm', rate: 16000 },
      providerOptions: {
        elevenlabs: {
          streaming: {
            includeLanguageDetection: true,
            includeTimestamps: false,
          },
        },
      },
    });

    const partsPromise = convertReadableStreamToArray(result.stream);
    const ws = MockWebSocket.instances[0];
    const url = new URL(ws.url);
    expect(url.searchParams.get('include_language_detection')).toBe('true');
    expect(url.searchParams.get('include_timestamps')).toBe('true');

    ws.open();
    ws.message({ message_type: 'session_started', session_id: 'session-1' });
    await flush();
    ws.message({ message_type: 'committed_transcript', text: 'Hola' });
    ws.message({
      message_type: 'committed_transcript_with_timestamps',
      text: 'Hola',
      language_code: 'es',
      words: [{ text: 'Hola', start: 0, end: 0.4, type: 'word' }],
    });

    await expect(partsPromise).resolves.toEqual([
      { type: 'stream-start', warnings: [] },
      {
        type: 'transcript-final',
        id: 'session-1:0',
        text: 'Hola',
      },
      {
        type: 'finish',
        text: 'Hola',
        segments: [],
        language: 'es',
        durationInSeconds: undefined,
      },
    ]);
  });

  it('finishes with committed text when the socket closes before timestamps arrive', async () => {
    const result = await createElevenLabs({
      apiKey: 'test-api-key',
      webSocket: MockWebSocket,
    }).transcription('scribe_v2_realtime').doStream!({
      audio: convertArrayToReadableStream([new Uint8Array([1])]),
      inputAudioFormat: { type: 'audio/pcm', rate: 16000 },
      providerOptions: {
        elevenlabs: { streaming: { includeTimestamps: true } },
      },
    });

    const partsPromise = convertReadableStreamToArray(result.stream);
    const ws = MockWebSocket.instances[0];
    ws.open();
    ws.message({ message_type: 'session_started', session_id: 'session-1' });
    await flush();
    ws.message({ message_type: 'committed_transcript', text: 'Hello' });
    ws.remoteClose();

    await expect(partsPromise).resolves.toEqual([
      { type: 'stream-start', warnings: [] },
      {
        type: 'transcript-final',
        id: 'session-1:0',
        text: 'Hello',
      },
      {
        type: 'finish',
        text: 'Hello',
        segments: [],
        language: undefined,
        durationInSeconds: undefined,
      },
    ]);
  });

  it('finishes a timestamp-only response to the final commit', async () => {
    const result = await createElevenLabs({
      apiKey: 'test-api-key',
      webSocket: MockWebSocket,
    }).transcription('scribe_v2_realtime').doStream!({
      audio: convertArrayToReadableStream([new Uint8Array([1])]),
      inputAudioFormat: { type: 'audio/pcm', rate: 16000 },
      providerOptions: {
        elevenlabs: { streaming: { includeTimestamps: true } },
      },
    });

    const partsPromise = convertReadableStreamToArray(result.stream);
    const ws = MockWebSocket.instances[0];
    ws.open();
    ws.message({ message_type: 'session_started', session_id: 'session-1' });
    await flush();
    ws.message({
      message_type: 'committed_transcript_with_timestamps',
      text: 'Hello',
      language_code: 'en',
      words: [{ text: 'Hello', start: 0, end: 0.4, type: 'word' }],
    });

    await expect(partsPromise).resolves.toEqual([
      { type: 'stream-start', warnings: [] },
      {
        type: 'transcript-final',
        id: 'session-1:0',
        text: 'Hello',
        startSecond: 0,
        endSecond: 0.4,
      },
      {
        type: 'finish',
        text: 'Hello',
        segments: [{ text: 'Hello', startSecond: 0, endSecond: 0.4 }],
        language: 'en',
        durationInSeconds: 0.4,
      },
    ]);
  });

  it('drains commits received after the input ends and correlates partial IDs', async () => {
    const result = await createElevenLabs({
      apiKey: 'test-api-key',
      webSocket: MockWebSocket,
    }).transcription('scribe_v2_realtime').doStream!({
      audio: convertArrayToReadableStream([new Uint8Array([1])]),
      inputAudioFormat: { type: 'audio/pcm', rate: 16000 },
    });

    const partsPromise = convertReadableStreamToArray(result.stream);
    const ws = MockWebSocket.instances[0];
    ws.open();
    ws.message({ message_type: 'session_started', session_id: 'session-1' });
    await flush();

    ws.message({ message_type: 'partial_transcript', text: 'First' });
    ws.message({ message_type: 'committed_transcript', text: ' First  ' });
    await flush();
    expect(ws.close).not.toHaveBeenCalled();

    // A server-initiated VAD/36-second commit can arrive just before the
    // explicit final commit. The first one must not finish the stream early.
    ws.message({ message_type: 'partial_transcript', text: 'Second' });
    ws.message({ message_type: 'committed_transcript', text: ' Second ' });

    await expect(partsPromise).resolves.toEqual([
      { type: 'stream-start', warnings: [] },
      {
        type: 'transcript-partial',
        id: 'session-1:0',
        text: 'First',
      },
      {
        type: 'transcript-final',
        id: 'session-1:0',
        text: 'First',
      },
      {
        type: 'transcript-partial',
        id: 'session-1:1',
        text: 'Second',
      },
      {
        type: 'transcript-final',
        id: 'session-1:1',
        text: 'Second',
      },
      {
        type: 'finish',
        text: 'First Second',
        segments: [],
        language: undefined,
        durationInSeconds: undefined,
      },
    ]);
  });

  it('handles legacy final transcript event variants', async () => {
    const result = await createElevenLabs({
      apiKey: 'test-api-key',
      webSocket: MockWebSocket,
    }).transcription('scribe_v2_realtime').doStream!({
      audio: convertArrayToReadableStream([new Uint8Array([1])]),
      inputAudioFormat: { type: 'audio/pcm', rate: 16000 },
      providerOptions: {
        elevenlabs: { streaming: { includeTimestamps: true } },
      },
    });

    const partsPromise = convertReadableStreamToArray(result.stream);
    const ws = MockWebSocket.instances[0];
    ws.open();
    ws.message({ message_type: 'session_started', session_id: 'session-1' });
    await flush();
    ws.message({ message_type: 'final_transcript', text: 'Legacy final' });
    ws.message({
      message_type: 'final_transcript_with_timestamps',
      text: 'Legacy final',
      language_code: 'en',
      words: [{ text: 'Legacy final', start: 0, end: 0.5, type: 'word' }],
    });

    await expect(partsPromise).resolves.toEqual([
      { type: 'stream-start', warnings: [] },
      {
        type: 'transcript-final',
        id: 'session-1:0',
        text: 'Legacy final',
      },
      {
        type: 'finish',
        text: 'Legacy final',
        segments: [{ text: 'Legacy final', startSecond: 0, endSecond: 0.5 }],
        language: 'en',
        durationInSeconds: 0.5,
      },
    ]);
  });

  it('finishes normally when the final empty commit is rejected', async () => {
    let audioController: ReadableStreamDefaultController<Uint8Array>;
    const audio = new ReadableStream<Uint8Array>({
      start(controller) {
        audioController = controller;
        controller.enqueue(new Uint8Array([1]));
      },
    });
    const result = await createElevenLabs({
      apiKey: 'test-api-key',
      webSocket: MockWebSocket,
    }).transcription('scribe_v2_realtime').doStream!({
      audio,
      inputAudioFormat: { type: 'audio/pcm', rate: 16000 },
    });

    const partsPromise = convertReadableStreamToArray(result.stream);
    const ws = MockWebSocket.instances[0];
    ws.open();
    ws.message({ message_type: 'session_started', session_id: 'session-1' });
    await flush();
    ws.message({ message_type: 'committed_transcript', text: 'Already done' });
    audioController!.close();
    await flush();
    ws.message({
      message_type: 'insufficient_audio_activity',
      error: 'not enough audio',
    });

    await expect(partsPromise).resolves.toEqual([
      { type: 'stream-start', warnings: [] },
      {
        type: 'transcript-final',
        id: 'session-1:0',
        text: 'Already done',
      },
      {
        type: 'finish',
        text: 'Already done',
        segments: [],
        language: undefined,
        durationInSeconds: undefined,
      },
    ]);
  });

  it('errors when the upstream closes before the final commit', async () => {
    const result = await createElevenLabs({
      apiKey: 'test-api-key',
      webSocket: MockWebSocket,
    }).transcription('scribe_v2_realtime').doStream!({
      audio: new ReadableStream<Uint8Array>(),
      inputAudioFormat: { type: 'audio/pcm', rate: 16000 },
    });

    const partsPromise = convertReadableStreamToArray(result.stream);
    const ws = MockWebSocket.instances[0];
    ws.open();
    ws.message({ message_type: 'session_started', session_id: 'session-1' });
    ws.remoteClose();

    await expect(partsPromise).rejects.toThrow(
      'ElevenLabs realtime transcription stream closed before completion',
    );
  });

  it('supports 8 kHz mu-law input', async () => {
    const model = createElevenLabs({
      apiKey: 'test-api-key',
      webSocket: MockWebSocket,
    }).transcription('scribe_v2_realtime');
    const result = await model.doStream!({
      audio: convertArrayToReadableStream([new Uint8Array([1])]),
      inputAudioFormat: { type: 'audio/pcmu', rate: 8000 },
    });

    const partsPromise = convertReadableStreamToArray(result.stream);
    const ws = MockWebSocket.instances[0];
    expect(new URL(ws.url).searchParams.get('audio_format')).toBe('ulaw_8000');
    ws.open();
    ws.message({ message_type: 'session_started', session_id: 'session-1' });
    await flush();
    ws.message({ message_type: 'committed_transcript', text: 'Hello' });
    await expect(partsPromise).resolves.toBeDefined();
  });

  it('defaults PCM input without a rate to 16 kHz', async () => {
    const model = createElevenLabs({
      apiKey: 'test-api-key',
      webSocket: MockWebSocket,
    }).transcription('scribe_v2_realtime');
    const result = await model.doStream!({
      audio: convertArrayToReadableStream([]),
      inputAudioFormat: { type: 'audio/pcm' },
    });

    const partsPromise = convertReadableStreamToArray(result.stream);
    const ws = MockWebSocket.instances[0];
    expect(new URL(ws.url).searchParams.get('audio_format')).toBe('pcm_16000');
    ws.open();
    ws.message({ message_type: 'session_started', session_id: 'session-1' });
    await flush();
    ws.message({ message_type: 'committed_transcript', text: 'Hello' });
    await expect(partsPromise).resolves.toBeDefined();
  });

  it('rejects non-realtime models and unsupported input formats', async () => {
    await expect(
      createElevenLabs({
        apiKey: 'test-api-key',
        webSocket: MockWebSocket,
      }).transcription('scribe_v2').doStream!({
        audio: convertArrayToReadableStream([]),
        inputAudioFormat: { type: 'audio/pcm', rate: 16000 },
      }),
    ).rejects.toBeInstanceOf(UnsupportedFunctionalityError);

    await expect(
      createElevenLabs({
        apiKey: 'test-api-key',
        webSocket: MockWebSocket,
      }).transcription('scribe_v2_realtime').doStream!({
        audio: convertArrayToReadableStream([]),
        inputAudioFormat: { type: 'audio/pcm', rate: 32000 },
      }),
    ).rejects.toThrow('ElevenLabs realtime transcription supports');
  });

  it('rejects background filtering together with timestamps', async () => {
    await expect(
      createElevenLabs({
        apiKey: 'test-api-key',
        webSocket: MockWebSocket,
      }).transcription('scribe_v2_realtime').doStream!({
        audio: convertArrayToReadableStream([]),
        inputAudioFormat: { type: 'audio/pcm', rate: 16000 },
        providerOptions: {
          elevenlabs: {
            streaming: {
              filterBackgroundAudio: true,
              includeTimestamps: true,
            },
          },
        },
      }),
    ).rejects.toThrow('cannot be combined');
  });

  it('rejects background filtering together with language detection', async () => {
    await expect(
      createElevenLabs({
        apiKey: 'test-api-key',
        webSocket: MockWebSocket,
      }).transcription('scribe_v2_realtime').doStream!({
        audio: convertArrayToReadableStream([]),
        inputAudioFormat: { type: 'audio/pcm', rate: 16000 },
        providerOptions: {
          elevenlabs: {
            streaming: {
              filterBackgroundAudio: true,
              includeLanguageDetection: true,
            },
          },
        },
      }),
    ).rejects.toThrow('cannot be combined');
  });

  it('accepts explicit null values in realtime provider options', async () => {
    const result = await createElevenLabs({
      apiKey: 'test-api-key',
      webSocket: MockWebSocket,
    }).transcription('scribe_v2_realtime').doStream!({
      audio: convertArrayToReadableStream([]),
      inputAudioFormat: { type: 'audio/pcm', rate: 16000 },
      providerOptions: {
        elevenlabs: {
          streaming: {
            commitStrategy: null,
            enableLogging: null,
            filterBackgroundAudio: null,
            includeLanguageDetection: null,
            includeTimestamps: null,
            keyterms: null,
            minSilenceDurationMs: null,
            minSpeechDurationMs: null,
            noVerbatim: null,
            previousText: null,
            secondaryLanguages: null,
            vadSilenceThresholdSecs: null,
            vadThreshold: null,
          },
        },
      },
    });

    const url = new URL(MockWebSocket.instances[0].url);
    expect(Object.fromEntries(url.searchParams)).toEqual({
      model_id: 'scribe_v2_realtime',
      audio_format: 'pcm_16000',
    });
    await result.stream.cancel();
  });

  it('warns about batch-only provider options', async () => {
    const result = await createElevenLabs({
      apiKey: 'test-api-key',
      webSocket: MockWebSocket,
    }).transcription('scribe_v2_realtime').doStream!({
      audio: convertArrayToReadableStream([new Uint8Array([1])]),
      inputAudioFormat: { type: 'audio/pcm', rate: 16000 },
      providerOptions: {
        elevenlabs: { diarize: true, numSpeakers: 2 },
      },
    });

    const partsPromise = convertReadableStreamToArray(result.stream);
    const ws = MockWebSocket.instances[0];
    ws.open();
    ws.message({ message_type: 'session_started', session_id: 'session-1' });
    await flush();
    ws.message({ message_type: 'committed_transcript', text: 'Hello' });
    const parts = await partsPromise;
    expect(parts[0]).toEqual({
      type: 'stream-start',
      warnings: [
        {
          type: 'unsupported',
          feature: 'providerOptions.elevenlabs.diarize',
          details:
            'ElevenLabs realtime transcription does not support diarize.',
        },
        {
          type: 'unsupported',
          feature: 'providerOptions.elevenlabs.numSpeakers',
          details:
            'ElevenLabs realtime transcription does not support numSpeakers.',
        },
      ],
    });
  });

  it('errors the stream with the provider error message', async () => {
    const result = await createElevenLabs({
      apiKey: 'test-api-key',
      webSocket: MockWebSocket,
    }).transcription('scribe_v2_realtime').doStream!({
      audio: convertArrayToReadableStream([new Uint8Array([1])]),
      inputAudioFormat: { type: 'audio/pcm', rate: 16000 },
    });

    const partsPromise = convertReadableStreamToArray(result.stream);
    const ws = MockWebSocket.instances[0];
    ws.open();
    ws.message({ message_type: 'session_started', session_id: 'session-1' });
    const assertion = expect(partsPromise).rejects.toThrow('quota exhausted');
    ws.message({ message_type: 'quota_exceeded', error: 'quota exhausted' });
    await assertion;
    expect(ws.close).toHaveBeenCalled();
  });

  it('explains the native WebSocket header requirement on socket errors', async () => {
    vi.stubGlobal('WebSocket', MockWebSocket);
    try {
      const result = await createElevenLabs({
        apiKey: 'test-api-key',
      }).transcription('scribe_v2_realtime').doStream!({
        audio: convertArrayToReadableStream([]),
        inputAudioFormat: { type: 'audio/pcm', rate: 16000 },
      });

      const partsPromise = convertReadableStreamToArray(result.stream);
      MockWebSocket.instances[0].error();
      await expect(partsPromise).rejects.toThrow(
        'Pass a header-capable WebSocket implementation',
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('cancels the audio stream when the WebSocket constructor throws', async () => {
    let audioCancelled = false;
    const audio = new ReadableStream<Uint8Array>({
      cancel() {
        audioCancelled = true;
      },
    });
    const model = createElevenLabs({
      apiKey: 'test-api-key',
      webSocket: class {
        constructor() {
          throw new Error('constructor failed');
        }
      } as never,
    }).transcription('scribe_v2_realtime');

    const result = await model.doStream!({
      audio,
      inputAudioFormat: { type: 'audio/pcm', rate: 16000 },
    });
    await expect(convertReadableStreamToArray(result.stream)).rejects.toThrow(
      'constructor failed',
    );
    expect(audioCancelled).toBe(true);
  });
});
