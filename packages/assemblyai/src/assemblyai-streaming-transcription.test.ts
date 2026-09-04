import {
  convertArrayToReadableStream,
  convertReadableStreamToArray,
} from '@ai-sdk/provider-utils/test';
import type { WebSocketConstructor } from '@ai-sdk/provider-utils';
import { describe, expect, it, vi } from 'vitest';
import { createAssemblyAI } from './assemblyai-provider';
import { AssemblyAITranscriptionModel } from './assemblyai-transcription-model';

vi.mock('./version', () => ({
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

  message(value: unknown) {
    this.onmessage?.({ data: JSON.stringify(value) });
  }
}

const flush = () => new Promise(resolve => setTimeout(resolve, 0));
const testDate = new Date(0);

function createModel(modelId = 'universal-3-5-pro') {
  MockWebSocket.instances = [];
  return new AssemblyAITranscriptionModel(modelId, {
    provider: 'assemblyai.transcription',
    url: ({ path }) => `https://api.assemblyai.com${path}`,
    streamingUrl: ({ path }) => `https://streaming.assemblyai.com${path}`,
    headers: () => ({ authorization: 'test-api-key' }),
    webSocket: MockWebSocket,
    _internal: { currentDate: () => testDate },
  });
}

const begin = {
  type: 'Begin',
  id: 'session-1',
  expires_at: 1,
  configuration: { model: 'universal-3-5-pro' },
};

const audio = () => convertArrayToReadableStream([new Uint8Array([1, 2, 3])]);

describe('doStream', () => {
  it('builds the WebSocket URL from the model, audio format, and provider options', async () => {
    const model = createModel();

    const result = await model.doStream({
      audio: audio(),
      inputAudioFormat: { type: 'audio/pcm', rate: 8000 },
      providerOptions: {
        assemblyai: {
          prompt: 'Cardiology consultation.',
          keytermsPrompt: ['AI SDK', 'AssemblyAI'],
          languageDetection: true,
          speakerLabels: true,
          filterProfanity: true,
          redactPii: true,
          redactPiiPolicies: ['person_name', 'phone_number'],
          redactPiiSub: 'entity_name',
          domain: 'medical-v1',
          streaming: {
            mode: 'max_accuracy',
            formatTurns: true,
            languageCodes: ['en', 'es'],
            maxSpeakers: 3,
            minTurnSilence: 400,
            maxTurnSilence: 1500,
            vadThreshold: 0.3,
            interruptionDelay: 300,
            continuousPartials: false,
            agentContext: 'What is your email address?',
            previousContextNTurns: 8,
            voiceFocus: 'near-field',
            voiceFocusThreshold: 0.8,
            includePartialTurns: false,
            inactivityTimeout: 60,
          },
        },
      },
    });
    void convertReadableStreamToArray(result.stream).catch(() => {});

    const ws = MockWebSocket.instances[0];
    const url = new URL(ws.url.toString());
    expect(url.origin + url.pathname).toBe(
      'wss://streaming.assemblyai.com/v3/ws',
    );
    expect(Object.fromEntries(url.searchParams)).toEqual({
      speech_model: 'universal-3-5-pro',
      encoding: 'pcm_s16le',
      sample_rate: '8000',
      prompt: 'Cardiology consultation.',
      keyterms_prompt: '["AI SDK","AssemblyAI"]',
      language_detection: 'true',
      speaker_labels: 'true',
      filter_profanity: 'true',
      redact_pii: 'true',
      redact_pii_policies: 'person_name,phone_number',
      redact_pii_sub: 'entity_name',
      domain: 'medical-v1',
      mode: 'max_accuracy',
      format_turns: 'true',
      language_codes: '["en","es"]',
      max_speakers: '3',
      min_turn_silence: '400',
      max_turn_silence: '1500',
      vad_threshold: '0.3',
      interruption_delay: '300',
      continuous_partials: 'false',
      agent_context: 'What is your email address?',
      previous_context_n_turns: '8',
      voice_focus: 'near-field',
      voice_focus_threshold: '0.8',
      include_partial_turns: 'false',
      inactivity_timeout: '60',
    });
    expect(ws.options?.headers).toMatchObject({
      authorization: 'test-api-key',
    });
    expect(result.request).toEqual({ body: ws.url.toString() });
    expect(result.response).toEqual({
      timestamp: testDate,
      modelId: 'universal-3-5-pro',
    });
  });

  it('defaults to 16 kHz PCM and omits the sample rate for compressed audio', async () => {
    const model = createModel();

    await model.doStream({
      audio: audio(),
      inputAudioFormat: { type: 'audio/pcm' },
    });
    expect(
      Object.fromEntries(new URL(MockWebSocket.instances[0].url).searchParams),
    ).toEqual({
      speech_model: 'universal-3-5-pro',
      encoding: 'pcm_s16le',
      sample_rate: '16000',
    });

    await model.doStream({
      audio: audio(),
      inputAudioFormat: { type: 'audio/ogg', rate: 48000 },
    });
    expect(
      Object.fromEntries(new URL(MockWebSocket.instances[1].url).searchParams),
    ).toEqual({
      speech_model: 'universal-3-5-pro',
      encoding: 'ogg_opus',
    });

    await model.doStream({
      audio: audio(),
      inputAudioFormat: { type: 'audio/pcmu', rate: 8000 },
    });
    expect(
      Object.fromEntries(new URL(MockWebSocket.instances[2].url).searchParams),
    ).toEqual({
      speech_model: 'universal-3-5-pro',
      encoding: 'pcm_mulaw',
      sample_rate: '8000',
    });
  });

  it('sends audio after Begin and Terminate after the audio ends', async () => {
    const model = createModel();

    const result = await model.doStream({
      audio: convertArrayToReadableStream([
        new Uint8Array([1, 2, 3]),
        // base64 chunks are decoded before sending:
        Buffer.from([4, 5, 6]).toString('base64'),
      ]),
      inputAudioFormat: { type: 'audio/pcm', rate: 16000 },
    });
    const partsPromise = convertReadableStreamToArray(result.stream);

    const ws = MockWebSocket.instances[0];
    expect(ws.send).not.toHaveBeenCalled();

    ws.message(begin);
    await flush();

    expect(ws.send).toHaveBeenNthCalledWith(1, new Uint8Array([1, 2, 3]));
    expect(ws.send).toHaveBeenNthCalledWith(2, new Uint8Array([4, 5, 6]));
    expect(JSON.parse(ws.send.mock.calls[2][0])).toEqual({
      type: 'Terminate',
    });

    ws.message({
      type: 'Termination',
      audio_duration_seconds: 1,
      session_duration_seconds: 2,
    });
    await partsPromise;
    expect(ws.close).toHaveBeenCalledWith(1000);
  });

  it('maps Turn and Termination messages to stream parts', async () => {
    const model = createModel();

    const result = await model.doStream({
      audio: audio(),
      inputAudioFormat: { type: 'audio/pcm', rate: 16000 },
    });
    const partsPromise = convertReadableStreamToArray(result.stream);
    const ws = MockWebSocket.instances[0];

    ws.message(begin);
    await flush();

    ws.message({
      type: 'Turn',
      turn_order: 0,
      turn_is_formatted: false,
      end_of_turn: false,
      transcript: 'hello',
      end_of_turn_confidence: 0,
      words: [
        {
          text: 'hello',
          start: 100,
          end: 500,
          confidence: 0.9,
          word_is_final: true,
        },
      ],
    });
    ws.message({
      type: 'Turn',
      turn_order: 0,
      turn_is_formatted: true,
      end_of_turn: true,
      transcript: 'Hello world.',
      end_of_turn_confidence: 1,
      speaker_label: 'A',
      language_code: 'en',
      language_confidence: 0.98,
      words: [
        {
          text: 'Hello',
          start: 100,
          end: 500,
          confidence: 0.9,
          word_is_final: true,
          speaker: 'A',
        },
        {
          text: 'world.',
          start: 600,
          end: 1200,
          confidence: 0.8,
          word_is_final: true,
          speaker: 'A',
        },
      ],
    });
    // silence-only turns are dropped:
    ws.message({
      type: 'Turn',
      turn_order: 1,
      turn_is_formatted: true,
      end_of_turn: true,
      transcript: '',
      end_of_turn_confidence: 1,
      words: [],
    });
    ws.message({
      type: 'Turn',
      turn_order: 2,
      turn_is_formatted: true,
      end_of_turn: true,
      transcript: 'Goodbye.',
      end_of_turn_confidence: 1,
      words: [
        {
          text: 'Goodbye.',
          start: 2000,
          end: 2500,
          confidence: 0.95,
          word_is_final: true,
        },
      ],
    });
    // only surfaced as raw / finish metadata:
    ws.message({ type: 'SpeechStarted' });
    ws.message({
      type: 'SpeakerRevision',
      revisions: [{ turn_order: 0, speaker_label: 'B', words: [] }],
    });
    ws.message({
      type: 'Termination',
      audio_duration_seconds: 3,
      session_duration_seconds: 4,
    });

    await expect(partsPromise).resolves.toEqual([
      { type: 'stream-start', warnings: [] },
      {
        type: 'response-metadata',
        timestamp: testDate,
        modelId: 'universal-3-5-pro',
      },
      {
        type: 'transcript-partial',
        id: 'turn-0',
        text: 'hello',
        startSecond: 0.1,
        durationInSeconds: 0.4,
      },
      {
        type: 'transcript-final',
        id: 'turn-0',
        text: 'Hello world.',
        startSecond: 0.1,
        endSecond: 1.2,
        providerMetadata: {
          assemblyai: {
            turnOrder: 0,
            endOfTurnConfidence: 1,
            speakerLabel: 'A',
            languageCode: 'en',
            languageConfidence: 0.98,
            words: [
              {
                text: 'Hello',
                start: 100,
                end: 500,
                confidence: 0.9,
                speaker: 'A',
              },
              {
                text: 'world.',
                start: 600,
                end: 1200,
                confidence: 0.8,
                speaker: 'A',
              },
            ],
          },
        },
      },
      {
        type: 'transcript-final',
        id: 'turn-2',
        text: 'Goodbye.',
        startSecond: 2,
        endSecond: 2.5,
        providerMetadata: {
          assemblyai: {
            turnOrder: 2,
            endOfTurnConfidence: 1,
            words: [
              { text: 'Goodbye.', start: 2000, end: 2500, confidence: 0.95 },
            ],
          },
        },
      },
      {
        type: 'finish',
        text: 'Hello world. Goodbye.',
        segments: [
          { text: 'Hello world.', startSecond: 0.1, endSecond: 1.2 },
          { text: 'Goodbye.', startSecond: 2, endSecond: 2.5 },
        ],
        language: 'en',
        durationInSeconds: 3,
        providerMetadata: {
          assemblyai: {
            sessionId: 'session-1',
            sessionDurationSeconds: 4,
            speakerRevisions: [
              { turn_order: 0, speaker_label: 'B', words: [] },
            ],
          },
        },
      },
    ]);
  });

  it('surfaces only the formatted final turn when formatTurns is enabled', async () => {
    const model = createModel('universal-streaming-english');

    const result = await model.doStream({
      audio: audio(),
      inputAudioFormat: { type: 'audio/pcm', rate: 16000 },
      providerOptions: {
        assemblyai: { streaming: { formatTurns: true } },
      },
    });
    const partsPromise = convertReadableStreamToArray(result.stream);
    const ws = MockWebSocket.instances[0];

    ws.message({
      ...begin,
      configuration: { model: 'universal-streaming-english' },
    });
    await flush();
    // Universal Streaming emits the unformatted end-of-turn first...
    ws.message({
      type: 'Turn',
      turn_order: 0,
      turn_is_formatted: false,
      end_of_turn: true,
      transcript: 'hello world',
      end_of_turn_confidence: 0.9,
      words: [],
    });
    // ...followed by the formatted version of the same turn.
    ws.message({
      type: 'Turn',
      turn_order: 0,
      turn_is_formatted: true,
      end_of_turn: true,
      transcript: 'Hello world.',
      end_of_turn_confidence: 0.9,
      words: [],
    });
    ws.message({
      type: 'Termination',
      audio_duration_seconds: 1,
      session_duration_seconds: 1,
    });

    const parts = await partsPromise;
    expect(parts.filter(part => part.type === 'transcript-partial')).toEqual([
      { type: 'transcript-partial', id: 'turn-0', text: 'hello world' },
    ]);
    expect(parts.filter(part => part.type === 'transcript-final')).toEqual([
      {
        type: 'transcript-final',
        id: 'turn-0',
        text: 'Hello world.',
        providerMetadata: {
          assemblyai: { turnOrder: 0, endOfTurnConfidence: 0.9, words: [] },
        },
      },
    ]);
    expect(parts.at(-1)).toMatchObject({
      type: 'finish',
      text: 'Hello world.',
      segments: [],
    });
  });

  it('uses a single steered language as the transcript language', async () => {
    const model = createModel();

    const result = await model.doStream({
      audio: audio(),
      inputAudioFormat: { type: 'audio/pcm', rate: 16000 },
      providerOptions: {
        assemblyai: { streaming: { languageCodes: ['es'] } },
      },
    });
    const partsPromise = convertReadableStreamToArray(result.stream);
    const ws = MockWebSocket.instances[0];

    ws.message(begin);
    await flush();
    ws.message({
      type: 'Turn',
      turn_order: 0,
      turn_is_formatted: true,
      end_of_turn: true,
      transcript: 'Hola.',
      end_of_turn_confidence: 1,
      words: [],
    });
    ws.message({
      type: 'Termination',
      audio_duration_seconds: 1,
      session_duration_seconds: 1,
    });

    const parts = await partsPromise;
    expect(parts.at(-1)).toMatchObject({
      type: 'finish',
      text: 'Hola.',
      language: 'es',
    });
  });

  it('warns about pre-recorded-only provider options', async () => {
    const model = createModel();

    const result = await model.doStream({
      audio: audio(),
      inputAudioFormat: { type: 'audio/pcm', rate: 16000 },
      providerOptions: {
        assemblyai: {
          summarization: true,
          languageCode: 'en',
          webhookUrl: undefined,
          prompt: 'Supported in streaming.',
        },
      },
    });
    const partsPromise = convertReadableStreamToArray(result.stream);
    const ws = MockWebSocket.instances[0];

    ws.message(begin);
    await flush();
    ws.message({
      type: 'Termination',
      audio_duration_seconds: 0,
      session_duration_seconds: 0,
    });

    const parts = await partsPromise;
    expect(parts[0]).toEqual({
      type: 'stream-start',
      warnings: [
        {
          type: 'unsupported',
          feature: 'providerOptions.assemblyai.summarization',
          details:
            'AssemblyAI streaming transcription does not support summarization.',
        },
        {
          type: 'unsupported',
          feature: 'providerOptions.assemblyai.languageCode',
          details:
            'AssemblyAI streaming transcription does not support languageCode. Use providerOptions.assemblyai.streaming.languageCodes instead.',
        },
      ],
    });
  });

  it('warns when the server applies a different speech model', async () => {
    const model = createModel('universal-3-6-pro');

    const result = await model.doStream({
      audio: audio(),
      inputAudioFormat: { type: 'audio/pcm', rate: 16000 },
    });
    const partsPromise = convertReadableStreamToArray(result.stream);
    const ws = MockWebSocket.instances[0];

    ws.message({ ...begin, configuration: { model: 'universal-3-5-pro' } });
    await flush();
    ws.message({
      type: 'Termination',
      audio_duration_seconds: 0,
      session_duration_seconds: 0,
    });

    const parts = await partsPromise;
    expect(parts.slice(0, 2)).toEqual([
      {
        type: 'stream-start',
        warnings: [
          {
            type: 'other',
            message:
              "AssemblyAI applied speech model 'universal-3-5-pro' instead of the requested 'universal-3-6-pro'.",
          },
        ],
      },
      {
        type: 'response-metadata',
        timestamp: testDate,
        modelId: 'universal-3-5-pro',
      },
    ]);
  });

  it('rejects unsupported audio formats without opening a socket', async () => {
    const model = createModel();

    await expect(
      model.doStream({
        audio: audio(),
        inputAudioFormat: { type: 'audio/pcma', rate: 8000 },
      }),
    ).rejects.toMatchObject({
      name: 'AI_InvalidArgumentError',
      argument: 'inputAudioFormat',
    });
    expect(MockWebSocket.instances).toHaveLength(0);
  });

  it('rejects pre-recorded-only models', async () => {
    for (const modelId of ['universal-2', 'universal-3-pro', 'best']) {
      const model = createModel(modelId);
      await expect(
        model.doStream({
          audio: audio(),
          inputAudioFormat: { type: 'audio/pcm', rate: 16000 },
        }),
      ).rejects.toMatchObject({
        name: 'AI_UnsupportedFunctionalityError',
        message: expect.stringContaining('experimental_streamTranscribe'),
      });
      expect(MockWebSocket.instances).toHaveLength(0);
    }
  });

  it('describes authorization failures reported through the close code', async () => {
    const model = createModel();

    const result = await model.doStream({
      audio: audio(),
      inputAudioFormat: { type: 'audio/pcm', rate: 16000 },
    });
    const partsPromise = convertReadableStreamToArray(result.stream);
    const ws = MockWebSocket.instances[0];

    ws.onclose?.({ code: 1008, reason: 'Not authorized' });

    await expect(partsPromise).rejects.toThrow(
      'AssemblyAI streaming transcription session closed before completion (code 1008: Not authorized): missing or invalid authorization, or an account issue such as insufficient balance.',
    );
  });

  it('describes audio pacing violations reported through the close code', async () => {
    const model = createModel();

    const result = await model.doStream({
      audio: audio(),
      inputAudioFormat: { type: 'audio/pcm', rate: 16000 },
    });
    const partsPromise = convertReadableStreamToArray(result.stream);
    const ws = MockWebSocket.instances[0];

    ws.message(begin);
    await flush();
    ws.onclose?.({ code: 3007 });

    await expect(partsPromise).rejects.toThrow(
      /code 3007.*faster than real time/,
    );
  });

  it('finishes when the socket closes normally after Terminate', async () => {
    const model = createModel();

    const result = await model.doStream({
      audio: audio(),
      inputAudioFormat: { type: 'audio/pcm', rate: 16000 },
    });
    const partsPromise = convertReadableStreamToArray(result.stream);
    const ws = MockWebSocket.instances[0];

    ws.message(begin);
    await flush();
    ws.message({
      type: 'Turn',
      turn_order: 0,
      turn_is_formatted: true,
      end_of_turn: true,
      transcript: 'Hello.',
      end_of_turn_confidence: 1,
      words: [
        {
          text: 'Hello.',
          start: 0,
          end: 500,
          confidence: 1,
          word_is_final: true,
        },
      ],
    });
    ws.onclose?.({ code: 1000 });

    const parts = await partsPromise;
    expect(parts.at(-1)).toEqual({
      type: 'finish',
      text: 'Hello.',
      segments: [{ text: 'Hello.', startSecond: 0, endSecond: 0.5 }],
      language: undefined,
      durationInSeconds: 0.5,
      providerMetadata: { assemblyai: { sessionId: 'session-1' } },
    });
  });

  it('surfaces Error messages as stream errors', async () => {
    const model = createModel();

    const result = await model.doStream({
      audio: audio(),
      inputAudioFormat: { type: 'audio/pcm', rate: 16000 },
    });
    const partsPromise = convertReadableStreamToArray(result.stream);
    const ws = MockWebSocket.instances[0];

    ws.message(begin);
    await flush();
    ws.message({ type: 'Error', error: 'Something went wrong' });

    await expect(partsPromise).rejects.toThrow('Something went wrong');
    expect(ws.close).toHaveBeenCalled();
  });

  it('includes raw chunks when requested', async () => {
    const model = createModel();

    const result = await model.doStream({
      audio: audio(),
      inputAudioFormat: { type: 'audio/pcm', rate: 16000 },
      includeRawChunks: true,
    });
    const partsPromise = convertReadableStreamToArray(result.stream);
    const ws = MockWebSocket.instances[0];

    ws.message(begin);
    await flush();
    ws.message({ type: 'SpeechStarted' });
    ws.message({
      type: 'Termination',
      audio_duration_seconds: 0,
      session_duration_seconds: 0,
    });

    const parts = await partsPromise;
    expect(parts.filter(part => part.type === 'raw')).toEqual([
      { type: 'raw', rawValue: begin },
      { type: 'raw', rawValue: { type: 'SpeechStarted' } },
      {
        type: 'raw',
        rawValue: {
          type: 'Termination',
          audio_duration_seconds: 0,
          session_duration_seconds: 0,
        },
      },
    ]);
  });

  it('closes the socket and cancels the audio when the stream is cancelled', async () => {
    const model = createModel();
    const audioStream = audio();
    const cancelSpy = vi.spyOn(audioStream, 'cancel');

    const result = await model.doStream({
      audio: audioStream,
      inputAudioFormat: { type: 'audio/pcm', rate: 16000 },
    });
    const ws = MockWebSocket.instances[0];

    await result.stream.cancel();

    expect(ws.close).toHaveBeenCalled();
    expect(cancelSpy).toHaveBeenCalled();
  });

  it('cancels the audio stream when the WebSocket constructor throws', async () => {
    const audioStream = audio();
    const cancelSpy = vi.spyOn(audioStream, 'cancel');
    const model = new AssemblyAITranscriptionModel('universal-3-5-pro', {
      provider: 'assemblyai.transcription',
      url: ({ path }) => `https://api.assemblyai.com${path}`,
      headers: () => ({ authorization: 'test-api-key' }),
      webSocket: class {
        constructor() {
          throw new Error('constructor failed');
        }
      } as unknown as WebSocketConstructor,
    });

    const result = await model.doStream({
      audio: audioStream,
      inputAudioFormat: { type: 'audio/pcm', rate: 16000 },
    });

    await expect(convertReadableStreamToArray(result.stream)).rejects.toThrow(
      'constructor failed',
    );
    expect(cancelSpy).toHaveBeenCalled();
  });

  it('wires the provider webSocket setting and default streaming host', async () => {
    MockWebSocket.instances = [];
    const provider = createAssemblyAI({
      apiKey: 'test-api-key',
      webSocket: MockWebSocket as unknown as WebSocketConstructor,
    });

    const result = await provider.transcription('universal-3-5-pro').doStream!({
      audio: audio(),
      inputAudioFormat: { type: 'audio/pcm', rate: 16000 },
    });
    void convertReadableStreamToArray(result.stream).catch(() => {});

    const ws = MockWebSocket.instances[0];
    expect(ws.url.toString()).toBe(
      'wss://streaming.assemblyai.com/v3/ws?speech_model=universal-3-5-pro&encoding=pcm_s16le&sample_rate=16000',
    );
    expect(ws.options?.headers).toMatchObject({
      authorization: 'test-api-key',
    });
  });
});

describe('doGenerate', () => {
  it('rejects streaming-only models', async () => {
    const provider = createAssemblyAI({ apiKey: 'test-api-key' });

    for (const modelId of [
      'universal-3-6-pro',
      'universal-streaming-english',
      'universal-streaming-multilingual',
    ]) {
      await expect(
        provider.transcription(modelId).doGenerate({
          audio: new Uint8Array([1, 2, 3]),
          mediaType: 'audio/wav',
        }),
      ).rejects.toMatchObject({
        name: 'AI_UnsupportedFunctionalityError',
        message: expect.stringContaining('experimental_streamTranscribe'),
      });
    }
  });
});
