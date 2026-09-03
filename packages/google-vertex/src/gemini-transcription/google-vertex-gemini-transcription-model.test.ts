import {
  convertArrayToReadableStream,
  convertReadableStreamToArray,
} from '@ai-sdk/provider-utils/test';
import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import { describe, expect, it, vi } from 'vitest';
import { GoogleVertexGeminiTranscriptionModel } from './google-vertex-gemini-transcription-model';

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

const BASE_URL =
  'https://us-central1-aiplatform.googleapis.com/v1beta1/projects/test-project/locations/us-central1/publishers/google';

function createModel(
  modelId = 'gemini-3.5-transcribe-live',
  overrides: Partial<{ finishGraceMs: number }> = {},
) {
  MockWebSocket.instances = [];
  return new GoogleVertexGeminiTranscriptionModel(modelId, {
    provider: 'test-provider',
    baseURL: BASE_URL,
    headers: () => ({ Authorization: 'Bearer test-oauth-token' }),
    webSocket: MockWebSocket,
    project: 'test-project',
    location: 'us-central1',
    _internal: {
      finishGraceMs: overrides.finishGraceMs ?? 5000,
    },
  });
}

describe('doGenerate', () => {
  const server = createTestServer({
    [`${BASE_URL}/models/gemini-3.5-transcribe:generateContent`]: {
      response: {
        type: 'json-value',
        body: {
          candidates: [
            {
              content: {
                parts: [{ text: 'Hello ' }, { text: 'world.' }],
              },
            },
          ],
          usageMetadata: {
            promptTokenCount: 10,
            candidatesTokenCount: 4,
          },
        },
      },
    },
  });

  it('transcribes audio via Vertex generateContent with audioTranscriptionConfig', async () => {
    const model = createModel('gemini-3.5-transcribe');

    const result = await model.doGenerate({
      audio: new Uint8Array([1, 2, 3, 4]),
      mediaType: 'audio/wav',
      providerOptions: {
        googleVertex: {
          customVocabulary: ['Gemini', 'Kubernetes'],
          languageCodes: ['es-ES'],
          mode: 'SMART',
        },
      },
    });

    expect(result.text).toBe('Hello world.');
    expect(await server.calls[0].requestBodyJson).toEqual({
      contents: [
        {
          role: 'user',
          parts: [
            {
              inlineData: {
                mimeType: 'audio/wav',
                data: 'AQIDBA==',
              },
            },
          ],
        },
      ],
      generationConfig: {
        audioTranscriptionConfig: {
          languageCodes: ['es-ES'],
          customVocabulary: ['Gemini', 'Kubernetes'],
          mode: 'SMART',
        },
      },
    });
    expect(server.calls[0].requestHeaders.authorization).toBe(
      'Bearer test-oauth-token',
    );
    expect(result.providerMetadata).toEqual({
      google: {
        usageMetadata: {
          promptTokenCount: 10,
          candidatesTokenCount: 4,
        },
      },
    });
  });

  it('accepts options under the google namespace as a fallback', async () => {
    const model = createModel('gemini-3.5-transcribe');

    await model.doGenerate({
      audio: new Uint8Array([1, 2, 3, 4]),
      mediaType: 'audio/wav',
      providerOptions: {
        google: { mode: 'SMART' },
      },
    });

    const body = (await server.calls[0].requestBodyJson) as Record<
      string,
      unknown
    >;
    expect(body.generationConfig).toEqual({
      audioTranscriptionConfig: { mode: 'SMART' },
    });
  });

  it('extracts text, language, and word segments from the audioTranscription part', async () => {
    server.urls[
      `${BASE_URL}/models/gemini-3.5-transcribe:generateContent`
    ].response = {
      type: 'json-value',
      body: {
        candidates: [
          {
            content: {
              parts: [
                {
                  audioTranscription: {
                    text: 'The quick brown fox.',
                    languageCode: 'en-US',
                    speakerLabel: 'spk:0',
                    words: [
                      {
                        word: 'The',
                        startOffset: '0.100s',
                        endOffset: '0.100s',
                      },
                      {
                        word: 'quick',
                        startOffset: '0.100s',
                        endOffset: '0.400s',
                      },
                      {
                        word: 'brown',
                        startOffset: '0.400s',
                        endOffset: '0.700s',
                      },
                      { word: 'fox.', startOffset: '0.700s', endOffset: '1s' },
                    ],
                  },
                },
              ],
            },
          },
        ],
        usageMetadata: { promptTokenCount: 64 },
      },
    };

    const model = createModel('gemini-3.5-transcribe');
    const result = await model.doGenerate({
      audio: new Uint8Array([1, 2, 3, 4]),
      mediaType: 'audio/wav',
      providerOptions: {},
    });

    expect(result.text).toBe('The quick brown fox.');
    expect(result.language).toBe('en-US');
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
  it('streams transcription over the Vertex Live API WebSocket', async () => {
    const model = createModel();

    const result = await model.doStream({
      audio: convertArrayToReadableStream([new Uint8Array([1, 2, 3])]),
      inputAudioFormat: { type: 'audio/pcm', rate: 16000 },
      providerOptions: {
        googleVertex: {
          customVocabulary: ['Gemini'],
          mode: 'SMART',
        },
      },
    });

    const partsPromise = convertReadableStreamToArray(result.stream);
    const ws = MockWebSocket.instances[0];
    expect(ws.url.toString()).toBe(
      'wss://us-central1-aiplatform.googleapis.com/ws/google.cloud.aiplatform.v1.LlmBidiService/BidiGenerateContent',
    );
    expect(ws.options?.headers).toEqual({
      Authorization: 'Bearer test-oauth-token',
    });

    ws.open();
    await flush();

    // audio is gated on setupComplete: only the setup message was sent
    expect(ws.send).toHaveBeenCalledTimes(1);
    expect(JSON.parse(ws.send.mock.calls[0][0])).toEqual({
      setup: {
        model:
          'projects/test-project/locations/us-central1/publishers/google/models/gemini-3.5-transcribe-live',
        inputAudioTranscription: {
          customVocabulary: ['Gemini'],
          mode: 'SMART',
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
      serverContent: { interimInputTranscription: { text: 'hel' } },
    });
    ws.message({
      serverContent: {
        inputTranscription: { text: 'hello world.', finished: true },
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
      {
        type: 'transcript-delta',
        id: 'google-segment-0',
        delta: 'hello world.',
      },
      {
        type: 'transcript-final',
        id: 'google-segment-0',
        text: 'hello world.',
      },
      {
        type: 'finish',
        text: 'hello world.',
        segments: [],
        language: undefined,
        durationInSeconds: undefined,
        providerMetadata: {
          google: { usageMetadata: { promptTokenCount: 7 } },
        },
      },
    ]);
    expect(ws.close).toHaveBeenCalledWith(1000);
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
      serverContent: { interimInputTranscription: { text: 'hello world.' } },
    });
    ws.message({ serverContent: { interactionStatus: 'IDLE' } });
    await flush();

    const parts = await partsPromise;
    expect(parts.at(-1)).toMatchObject({
      type: 'finish',
      text: 'hello world.',
    });
  });

  it('errors when the socket closes before the audio ended', async () => {
    const model = createModel();

    const result = await model.doStream({
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
});
