import {
  convertArrayToReadableStream,
  convertReadableStreamToArray,
} from '@ai-sdk/provider-utils/test';
import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import { describe, expect, it, vi } from 'vitest';
import { GoogleTranscriptionModel } from './google-transcription-model';

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
  modelId = 'gemini-3.5-transcribe-live',
  overrides: Partial<{
    finishGraceMs: number;
    currentDate: () => Date;
  }> = {},
) {
  MockWebSocket.instances = [];
  return new GoogleTranscriptionModel(modelId, {
    provider: 'test-provider',
    baseURL: 'https://generativelanguage.googleapis.com/v1beta',
    headers: () => ({ 'x-goog-api-key': 'test-api-key' }),
    webSocket: MockWebSocket,
    _internal: {
      finishGraceMs: overrides.finishGraceMs ?? 5000,
      ...(overrides.currentDate != null
        ? { currentDate: overrides.currentDate }
        : {}),
    },
  });
}

describe('doGenerate', () => {
  const server = createTestServer({
    'https://generativelanguage.googleapis.com/v1beta/interactions': {
      response: {
        type: 'json-value',
        body: {
          id: 'interactions/test',
          status: 'completed',
          steps: [
            {
              type: 'model_output',
              content: [{ type: 'text', text: 'Hello world.' }],
            },
          ],
          usage: {
            total_tokens: 10,
            total_input_tokens: 10,
            total_output_tokens: 0,
          },
        },
      },
    },
  });

  it('transcribes audio via the Interactions API with transcription_config', async () => {
    const model = createModel('gemini-3.5-transcribe');

    const result = await model.doGenerate({
      audio: new Uint8Array([1, 2, 3, 4]),
      mediaType: 'audio/wav',
      providerOptions: {
        google: {
          customVocabulary: ['Gemini', 'Kubernetes'],
          languageCodes: ['es-ES'],
          mode: 'SMART',
        },
      },
    });

    expect(result.text).toBe('Hello world.');
    expect(await server.calls[0].requestBodyJson).toEqual({
      model: 'gemini-3.5-transcribe',
      input: [
        {
          type: 'audio',
          data: 'AQIDBA==',
          mime_type: 'audio/wav',
        },
      ],
      generation_config: {
        transcription_config: {
          language_codes: ['es-ES'],
          custom_vocabulary: ['Gemini', 'Kubernetes'],
          mode: { type: 'smart' },
        },
      },
    });
    expect(server.calls[0].requestHeaders['x-goog-api-key']).toBe(
      'test-api-key',
    );
    expect(result.providerMetadata).toEqual({
      google: {
        usage: {
          total_tokens: 10,
          total_input_tokens: 10,
          total_output_tokens: 0,
        },
      },
    });
    expect(result.usage).toEqual({
      total_tokens: 10,
      total_input_tokens: 10,
      total_output_tokens: 0,
    });
  });

  it('maps diarization and word timestamps into the mode object', async () => {
    const model = createModel('gemini-3.5-transcribe');

    await model.doGenerate({
      audio: new Uint8Array([1, 2, 3, 4]),
      mediaType: 'audio/wav',
      providerOptions: {
        google: { diarization: true, wordTimestamp: true },
      },
    });

    const body = (await server.calls[0].requestBodyJson) as {
      generation_config?: { transcription_config?: unknown };
    };
    expect(body.generation_config?.transcription_config).toEqual({
      mode: {
        type: 'verbatim',
        diarization_mode: 'speaker',
        timestamp_granularities: ['word'],
      },
    });
  });

  it('omits generation_config when no transcription options are set', async () => {
    const model = createModel('gemini-3.5-transcribe');

    await model.doGenerate({
      audio: new Uint8Array([1, 2, 3, 4]),
      mediaType: 'audio/wav',
      providerOptions: {},
    });

    const body = (await server.calls[0].requestBodyJson) as Record<
      string,
      unknown
    >;
    expect(body.generation_config).toBeUndefined();
  });

  it('extracts word segments from word_info annotations', async () => {
    server.urls[
      'https://generativelanguage.googleapis.com/v1beta/interactions'
    ].response = {
      type: 'json-value',
      body: {
        id: 'interactions/test',
        status: 'completed',
        steps: [
          {
            type: 'model_output',
            content: [
              {
                type: 'text',
                text: 'The quick brown fox.',
                annotations: [
                  {
                    type: 'word_info',
                    text: 'The',
                    speaker: 'spk:0',
                    start_offset: '0.100s',
                    end_offset: '0.100s',
                  },
                  {
                    type: 'word_info',
                    text: 'quick',
                    speaker: 'spk:0',
                    start_offset: '0.100s',
                    end_offset: '0.400s',
                  },
                  {
                    type: 'word_info',
                    text: 'brown',
                    speaker: 'spk:0',
                    start_offset: '0.400s',
                    end_offset: '0.700s',
                  },
                  {
                    type: 'word_info',
                    text: 'fox.',
                    speaker: 'spk:0',
                    start_offset: '0.700s',
                    end_offset: '1s',
                  },
                ],
              },
            ],
          },
        ],
        usage: { total_input_tokens: 64 },
      },
    };

    const model = createModel('gemini-3.5-transcribe');
    const result = await model.doGenerate({
      audio: new Uint8Array([1, 2, 3, 4]),
      mediaType: 'audio/wav',
      providerOptions: {},
    });

    expect(result.text).toBe('The quick brown fox.');
    expect(result.segments).toEqual([
      { text: 'The', startSecond: 0.1, endSecond: 0.1 },
      { text: 'quick', startSecond: 0.1, endSecond: 0.4 },
      { text: 'brown', startSecond: 0.4, endSecond: 0.7 },
      { text: 'fox.', startSecond: 0.7, endSecond: 1 },
    ]);
  });

  it('rejects unary transcription on live model ids', async () => {
    const model = createModel('gemini-3.5-transcribe-live');

    await expect(
      model.doGenerate({
        audio: new Uint8Array([1]),
        mediaType: 'audio/wav',
        providerOptions: {},
      }),
    ).rejects.toThrow('only supports streaming transcription');
  });
});

describe('doStream', () => {
  it('streams transcription over the Gemini Live API WebSocket', async () => {
    const model = createModel();

    const result = await model.doStream({
      audio: convertArrayToReadableStream([new Uint8Array([1, 2, 3])]),
      inputAudioFormat: { type: 'audio/pcm', rate: 16000 },
      providerOptions: {
        google: {
          customVocabulary: ['Gemini'],
          languageCodes: ['en-US'],
        },
      },
    });

    const partsPromise = convertReadableStreamToArray(result.stream);
    const ws = MockWebSocket.instances[0];
    expect(ws.url.toString()).toBe(
      'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=test-api-key',
    );

    ws.open();
    await flush();

    // audio is gated on setupComplete: only the setup message was sent
    expect(ws.send).toHaveBeenCalledTimes(1);
    expect(JSON.parse(ws.send.mock.calls[0][0])).toEqual({
      setup: {
        model: 'models/gemini-3.5-transcribe-live',
        inputAudioTranscription: {
          languageCodes: ['en-US'],
          customVocabulary: ['Gemini'],
        },
      },
    });

    ws.message({ setupComplete: {} });
    await flush();

    // audio chunk + audioStreamEnd
    expect(ws.send).toHaveBeenCalledTimes(3);
    expect(JSON.parse(ws.send.mock.calls[1][0])).toEqual({
      realtimeInput: {
        audio: { data: 'AQID', mimeType: 'audio/pcm;rate=16000' },
      },
    });
    expect(JSON.parse(ws.send.mock.calls[2][0])).toEqual({
      realtimeInput: { audioStreamEnd: true },
    });

    ws.message({
      serverContent: {
        interimInputTranscription: { text: 'hel' },
      },
    });
    ws.message({
      serverContent: {
        inputTranscription: { text: 'hello ', languageCode: 'en-US' },
      },
    });
    ws.message({
      serverContent: {
        inputTranscription: { text: 'world.', finished: true },
      },
    });
    ws.message({
      usageMetadata: { promptTokenCount: 7 },
      serverContent: { turnComplete: true, interactionStatus: 'IDLE' },
    });
    await flush();

    const parts = await partsPromise;
    expect(parts).toEqual([
      { type: 'stream-start', warnings: [] },
      { type: 'transcript-partial', id: 'google-segment-0', text: 'hel' },
      { type: 'transcript-delta', id: 'google-segment-0', delta: 'hello ' },
      { type: 'transcript-delta', id: 'google-segment-0', delta: 'world.' },
      {
        type: 'transcript-final',
        id: 'google-segment-0',
        text: 'hello world.',
      },
      {
        type: 'finish',
        text: 'hello world.',
        segments: [],
        language: 'en-US',
        durationInSeconds: undefined,
        usage: { promptTokenCount: 7 },
        providerMetadata: {
          google: { usageMetadata: { promptTokenCount: 7 } },
        },
      },
    ]);
    expect(ws.close).toHaveBeenCalledWith(1000);
  });

  it('passes the SMART transcription mode into the live setup', async () => {
    const model = createModel();

    const result = await model.doStream({
      audio: convertArrayToReadableStream([new Uint8Array([1, 2])]),
      inputAudioFormat: { type: 'audio/pcm', rate: 16000 },
      providerOptions: {
        google: { mode: 'SMART' },
      },
    });

    const partsPromise = convertReadableStreamToArray(result.stream);
    const ws = MockWebSocket.instances[0];
    ws.open();
    await flush();

    expect(JSON.parse(ws.send.mock.calls[0][0])).toEqual({
      setup: {
        model: 'models/gemini-3.5-transcribe-live',
        inputAudioTranscription: { mode: 'SMART' },
      },
    });

    ws.message({ setupComplete: {} });
    await flush();
    ws.message({
      serverContent: { inputTranscription: { text: 'hi', finished: true } },
    });
    ws.message({ serverContent: { interactionStatus: 'IDLE' } });
    await flush();
    await expect(partsPromise).resolves.toBeDefined();
  });

  it('accepts the pre-launch REQUIRES_ACTION interaction status as idle', async () => {
    const model = createModel();

    const result = await model.doStream({
      audio: convertArrayToReadableStream([new Uint8Array([1, 2])]),
      inputAudioFormat: { type: 'audio/pcm', rate: 16000 },
      providerOptions: {},
    });

    const partsPromise = convertReadableStreamToArray(result.stream);
    const ws = MockWebSocket.instances[0];
    ws.open();
    ws.message({ setupComplete: {} });
    await flush();

    ws.message({
      serverContent: { inputTranscription: { text: 'hi', finished: true } },
    });
    ws.message({
      serverContent: { interactionStatus: 'REQUIRES_ACTION' },
    });
    await flush();

    const parts = await partsPromise;
    expect(parts.at(-1)).toMatchObject({ type: 'finish', text: 'hi' });
  });

  it('falls back to the latest interim partial when no final segment arrives', async () => {
    const model = createModel();

    const result = await model.doStream({
      audio: convertArrayToReadableStream([new Uint8Array([1, 2])]),
      inputAudioFormat: { type: 'audio/pcm', rate: 16000 },
      providerOptions: {},
    });

    const partsPromise = convertReadableStreamToArray(result.stream);
    const ws = MockWebSocket.instances[0];
    ws.open();
    ws.message({ setupComplete: {} });
    await flush();

    ws.message({
      serverContent: { interimInputTranscription: { text: 'hello wor' } },
    });
    ws.message({
      serverContent: { interimInputTranscription: { text: 'hello world.' } },
    });
    ws.message({ serverContent: { interactionStatus: 'IDLE' } });
    await flush();

    const parts = await partsPromise;
    expect(parts.at(-2)).toEqual({
      type: 'transcript-final',
      id: 'google-segment-0',
      text: 'hello world.',
    });
    expect(parts.at(-1)).toMatchObject({
      type: 'finish',
      text: 'hello world.',
    });
  });

  it('finishes with accumulated text when the server closes after audio ended', async () => {
    const model = createModel();

    const result = await model.doStream({
      audio: convertArrayToReadableStream([new Uint8Array([1, 2])]),
      inputAudioFormat: { type: 'audio/pcm', rate: 16000 },
      providerOptions: {},
    });

    const partsPromise = convertReadableStreamToArray(result.stream);
    const ws = MockWebSocket.instances[0];
    ws.open();
    ws.message({ setupComplete: {} });
    await flush();

    ws.message({
      serverContent: { inputTranscription: { text: 'partial words' } },
    });
    ws.serverClose(1000);
    await flush();

    const parts = await partsPromise;
    expect(parts.at(-1)).toMatchObject({
      type: 'finish',
      text: 'partial words',
    });
  });

  it('completes each segment on generationComplete and finishes once server VAD ended the speech', async () => {
    const model = createModel();

    let audioController!: ReadableStreamDefaultController<Uint8Array>;
    const audio = new ReadableStream<Uint8Array>({
      start(controller) {
        audioController = controller;
      },
    });

    const result = await model.doStream({
      audio,
      inputAudioFormat: { type: 'audio/pcm', rate: 16000 },
      providerOptions: {},
    });

    const partsPromise = convertReadableStreamToArray(result.stream);
    const ws = MockWebSocket.instances[0];
    ws.open();
    ws.message({ setupComplete: {} });
    await flush();

    // server-side VAD completes a segment while audio is still streaming:
    audioController.enqueue(new Uint8Array([1, 2]));
    ws.message({
      voiceActivity: { type: 'ACTIVITY_START', audioOffset: '0.280s' },
    });
    ws.message({
      serverContent: {
        inputTranscription: { text: 'It was delivered into Earth orbit' },
      },
    });
    ws.message({ serverContent: { generationComplete: true } });
    ws.message({ voiceActivity: { type: 'ACTIVITY_END', audioOffset: '2s' } });
    await flush();

    // the audio ends during the next segment:
    ws.message({
      voiceActivity: { type: 'ACTIVITY_START', audioOffset: '3s' },
    });
    await flush();
    audioController.close();
    await flush();
    expect(JSON.parse(ws.send.mock.calls.at(-1)?.[0])).toEqual({
      realtimeInput: { audioStreamEnd: true },
    });

    ws.message({
      serverContent: { inputTranscription: { text: 'on October 18th, 1989.' } },
    });
    ws.message({ serverContent: { generationComplete: true } });
    ws.message({ voiceActivity: { type: 'ACTIVITY_END', audioOffset: '5s' } });
    await flush();

    expect(await partsPromise).toEqual([
      { type: 'stream-start', warnings: [] },
      {
        type: 'transcript-delta',
        id: 'google-segment-0',
        delta: 'It was delivered into Earth orbit',
      },
      {
        type: 'transcript-final',
        id: 'google-segment-0',
        text: 'It was delivered into Earth orbit',
      },
      {
        type: 'transcript-delta',
        id: 'google-segment-1',
        delta: 'on October 18th, 1989.',
      },
      {
        type: 'transcript-final',
        id: 'google-segment-1',
        text: 'on October 18th, 1989.',
      },
      {
        type: 'finish',
        text: 'It was delivered into Earth orbit on October 18th, 1989.',
        segments: [],
        language: undefined,
        durationInSeconds: undefined,
      },
    ]);
    expect(ws.close).toHaveBeenCalledWith(1000);
  });

  it('finishes when the audio ends after server VAD ended the speech', async () => {
    const model = createModel();

    let audioController!: ReadableStreamDefaultController<Uint8Array>;
    const audio = new ReadableStream<Uint8Array>({
      start(controller) {
        audioController = controller;
      },
    });

    const result = await model.doStream({
      audio,
      inputAudioFormat: { type: 'audio/pcm', rate: 16000 },
      providerOptions: {},
    });

    const partsPromise = convertReadableStreamToArray(result.stream);
    const ws = MockWebSocket.instances[0];
    ws.open();
    ws.message({ setupComplete: {} });
    await flush();

    audioController.enqueue(new Uint8Array([1, 2]));
    ws.message({
      voiceActivity: { type: 'ACTIVITY_START', audioOffset: '0.280s' },
    });
    ws.message({ serverContent: { inputTranscription: { text: 'hello.' } } });
    ws.message({ serverContent: { generationComplete: true } });
    ws.message({ voiceActivity: { type: 'ACTIVITY_END', audioOffset: '2s' } });
    await flush();

    // trailing silence: the server sends nothing after audioStreamEnd
    audioController.close();
    await flush();

    const parts = await partsPromise;
    expect(parts.at(-2)).toEqual({
      type: 'transcript-final',
      id: 'google-segment-0',
      text: 'hello.',
    });
    expect(parts.at(-1)).toMatchObject({ type: 'finish', text: 'hello.' });
  });

  it('waits for buffered audio segments when the audio was sent faster than real time', async () => {
    const model = createModel();

    let audioController!: ReadableStreamDefaultController<Uint8Array>;
    const audio = new ReadableStream<Uint8Array>({
      start(controller) {
        audioController = controller;
      },
    });

    const result = await model.doStream({
      audio,
      inputAudioFormat: { type: 'audio/pcm', rate: 16000 },
      providerOptions: {},
    });

    let settled = false;
    const partsPromise = convertReadableStreamToArray(result.stream).finally(
      () => {
        settled = true;
      },
    );
    const ws = MockWebSocket.instances[0];
    ws.open();
    ws.message({ setupComplete: {} });
    await flush();

    // 2 seconds of 16kHz 16-bit audio, sent at once:
    audioController.enqueue(new Uint8Array(64000));
    ws.message({
      voiceActivity: { type: 'ACTIVITY_START', audioOffset: '0.280s' },
    });
    ws.message({ serverContent: { inputTranscription: { text: 'hello.' } } });
    ws.message({ serverContent: { generationComplete: true } });
    ws.message({ voiceActivity: { type: 'ACTIVITY_END', audioOffset: '1s' } });
    await flush();
    audioController.close();
    await flush();

    // the server is still processing the rest of the buffered audio:
    expect(settled).toBe(false);

    ws.message({
      voiceActivity: { type: 'ACTIVITY_START', audioOffset: '1.200s' },
    });
    ws.message({ serverContent: { inputTranscription: { text: 'world.' } } });
    ws.message({ serverContent: { generationComplete: true } });
    await flush();
    expect(settled).toBe(false);

    ws.message({ voiceActivity: { type: 'ACTIVITY_END', audioOffset: '2s' } });
    await flush();

    const parts = await partsPromise;
    expect(parts.at(-1)).toMatchObject({
      type: 'finish',
      text: 'hello. world.',
    });
  });

  it('waits for buffered audio segments when the server processes them slower than real time', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      const model = createModel();

      let audioController!: ReadableStreamDefaultController<Uint8Array>;
      const audio = new ReadableStream<Uint8Array>({
        start(controller) {
          audioController = controller;
        },
      });

      const result = await model.doStream({
        audio,
        inputAudioFormat: { type: 'audio/pcm', rate: 16000 },
        providerOptions: {},
      });

      let settled = false;
      const partsPromise = convertReadableStreamToArray(result.stream).finally(
        () => {
          settled = true;
        },
      );
      const ws = MockWebSocket.instances[0];
      ws.open();
      ws.message({ setupComplete: {} });
      await flush();

      // 2 seconds of 16kHz 16-bit audio, sent at once:
      audioController.enqueue(new Uint8Array(64000));
      audioController.close();
      await flush();

      // the server takes longer than the audio duration to catch up:
      vi.setSystemTime(Date.now() + 5000);
      ws.message({
        voiceActivity: { type: 'ACTIVITY_START', audioOffset: '0.280s' },
      });
      ws.message({ serverContent: { inputTranscription: { text: 'hello.' } } });
      ws.message({ serverContent: { generationComplete: true } });
      ws.message({
        voiceActivity: { type: 'ACTIVITY_END', audioOffset: '1s' },
      });
      await flush();
      expect(settled).toBe(false);

      ws.message({
        voiceActivity: { type: 'ACTIVITY_START', audioOffset: '1.200s' },
      });
      ws.message({ serverContent: { inputTranscription: { text: 'world.' } } });
      ws.message({ serverContent: { generationComplete: true } });
      ws.message({
        voiceActivity: { type: 'ACTIVITY_END', audioOffset: '2s' },
      });
      await flush();

      const parts = await partsPromise;
      expect(parts.at(-1)).toMatchObject({
        type: 'finish',
        text: 'hello. world.',
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('waits for the segment transcript when ACTIVITY_END arrives before it', async () => {
    const model = createModel();

    let audioController!: ReadableStreamDefaultController<Uint8Array>;
    const audio = new ReadableStream<Uint8Array>({
      start(controller) {
        audioController = controller;
      },
    });

    const result = await model.doStream({
      audio,
      inputAudioFormat: { type: 'audio/pcm', rate: 16000 },
      providerOptions: {},
    });

    let settled = false;
    const partsPromise = convertReadableStreamToArray(result.stream).finally(
      () => {
        settled = true;
      },
    );
    const ws = MockWebSocket.instances[0];
    ws.open();
    ws.message({ setupComplete: {} });
    await flush();

    audioController.enqueue(new Uint8Array([1, 2]));
    ws.message({
      voiceActivity: { type: 'ACTIVITY_START', audioOffset: '0.280s' },
    });
    await flush();

    // the audio ends mid-speech; VAD ends the speech before its transcript:
    audioController.close();
    await flush();
    ws.message({
      voiceActivity: { type: 'ACTIVITY_END', audioOffset: '0.900s' },
    });
    await flush();
    expect(settled).toBe(false);

    ws.message({ serverContent: { inputTranscription: { text: 'Yes.' } } });
    ws.message({ serverContent: { generationComplete: true } });
    await flush();

    const parts = await partsPromise;
    expect(parts.at(-1)).toMatchObject({ type: 'finish', text: 'Yes.' });
  });

  it('errors when the socket closes before the audio ended', async () => {
    const model = createModel();

    const result = await model.doStream({
      // a never-ending audio stream: the reader stays pending
      audio: new ReadableStream<Uint8Array>({ start: () => {} }),
      inputAudioFormat: { type: 'audio/pcm', rate: 16000 },
      providerOptions: {},
    });

    const partsPromise = convertReadableStreamToArray(result.stream);
    const rejection = expect(partsPromise).rejects.toThrow(
      'closed unexpectedly before finishing (code 1011, reason: internal error)',
    );
    const ws = MockWebSocket.instances[0];
    ws.open();
    ws.message({ setupComplete: {} });
    await flush();

    ws.serverClose(1011, 'internal error');
    await rejection;
  });

  it('surfaces server error messages', async () => {
    const model = createModel();

    const result = await model.doStream({
      audio: convertArrayToReadableStream([new Uint8Array([1])]),
      inputAudioFormat: { type: 'audio/pcm', rate: 16000 },
      providerOptions: {},
    });

    const partsPromise = convertReadableStreamToArray(result.stream);
    const rejection = expect(partsPromise).rejects.toThrow('quota exceeded');
    const ws = MockWebSocket.instances[0];
    ws.open();
    ws.message({ setupComplete: {} });
    await flush();
    ws.message({ error: { message: 'quota exceeded' } });
    await flush();

    await rejection;
  });

  it('rejects streaming on unary model ids', async () => {
    const model = createModel('gemini-3.5-transcribe');

    await expect(
      model.doStream({
        audio: convertArrayToReadableStream([new Uint8Array([1])]),
        inputAudioFormat: { type: 'audio/pcm', rate: 16000 },
        providerOptions: {},
      }),
    ).rejects.toThrow('does not support streaming transcription');
  });

  it('rejects non-16kHz PCM input audio', async () => {
    const model = createModel();

    await expect(
      model.doStream({
        audio: convertArrayToReadableStream([new Uint8Array([1])]),
        inputAudioFormat: { type: 'audio/pcm', rate: 24000 },
        providerOptions: {},
      }),
    ).rejects.toThrow('only supports 16kHz 16-bit PCM input audio');
  });

  it('emits raw chunks when includeRawChunks is set', async () => {
    const model = createModel();

    const result = await model.doStream({
      audio: convertArrayToReadableStream([new Uint8Array([1])]),
      inputAudioFormat: { type: 'audio/pcm', rate: 16000 },
      providerOptions: {},
      includeRawChunks: true,
    });

    const partsPromise = convertReadableStreamToArray(result.stream);
    const ws = MockWebSocket.instances[0];
    ws.open();
    ws.message({ setupComplete: {} });
    await flush();
    ws.message({
      serverContent: { inputTranscription: { text: 'ok', finished: true } },
    });
    ws.message({ serverContent: { interactionStatus: 'IDLE' } });
    await flush();

    const parts = await partsPromise;
    expect(parts.filter(part => part.type === 'raw').length).toBeGreaterThan(0);
  });
});
