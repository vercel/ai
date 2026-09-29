import {
  InvalidArgumentError,
  UnsupportedFunctionalityError,
  type JSONObject,
} from '@ai-sdk/provider';
import type { WebSocketConstructor } from '@ai-sdk/provider-utils';
import {
  convertArrayToReadableStream,
  convertReadableStreamToArray,
} from '@ai-sdk/provider-utils/test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createAzure,
  type AzureOpenAIProviderSettings,
} from './azure-openai-provider';

vi.mock('./version', () => ({ VERSION: '0.0.0-test' }));

class MockWebSocket {
  static instances: MockWebSocket[] = [];

  readyState = 0;
  sent: Array<Record<string, unknown>> = [];
  send = vi.fn((data: string) => {
    this.sent.push(JSON.parse(data));
  });
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

  types() {
    return this.sent.map(event => event.type);
  }
}

const flush = () => new Promise(resolve => setTimeout(resolve, 0));

const pcm = new Uint8Array(48_000); // 1 second at 24 kHz
const transcription = 'conversation.item.input_audio_transcription';

function setup(settings: AzureOpenAIProviderSettings = {}) {
  return createAzure({
    resourceName: 'test-resource',
    apiKey: 'test-key',
    webSocket: MockWebSocket as unknown as WebSocketConstructor,
    ...settings,
  });
}

async function startStream(
  options: {
    settings?: AzureOpenAIProviderSettings;
    modelId?: string;
    audio?: Array<Uint8Array | string>;
    rate?: number;
    providerOptions?: Record<string, JSONObject>;
    includeRawChunks?: boolean;
    abortSignal?: AbortSignal;
  } = {},
) {
  const result = await setup(options.settings).transcription(
    options.modelId ?? 'mai-transcribe-2-streaming',
  ).doStream!({
    audio: convertArrayToReadableStream(options.audio ?? [pcm]),
    inputAudioFormat: { type: 'audio/pcm', rate: options.rate ?? 24000 },
    providerOptions: options.providerOptions,
    includeRawChunks: options.includeRawChunks,
    abortSignal: options.abortSignal,
  });
  const parts = convertReadableStreamToArray(result.stream);
  const ws = MockWebSocket.instances.at(-1)!;
  return { result, parts, ws };
}

async function configureSession(ws: MockWebSocket) {
  ws.open();
  ws.message({ type: 'session.created', session: { id: 'sess_1' } });
  await flush();
  ws.message({ type: 'session.updated', session: { id: 'sess_1' } });
  await flush();
  await flush();
}

beforeEach(() => {
  MockWebSocket.instances = [];
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('MAI streaming transcription', () => {
  it('configures the session, streams audio, and maps transcript events', async () => {
    const { result, parts, ws } = await startStream({
      providerOptions: { azure: { language: 'en' } },
    });

    expect(String(ws.url)).toBe(
      'wss://test-resource.services.ai.azure.com/mai/v1/realtime?intent=transcription',
    );
    expect(ws.options?.headers?.['api-key']).toBe('test-key');

    ws.open();
    ws.message({ type: 'session.created', session: { id: 'sess_1' } });
    await flush();
    expect(ws.sent).toEqual([
      {
        type: 'session.update',
        session: {
          type: 'transcription',
          audio: {
            input: {
              format: { type: 'audio/pcm', rate: 24000 },
              transcription: {
                model: 'mai-transcribe-2-streaming',
                language: 'en',
              },
              turn_detection: null,
              noise_reduction: null,
            },
          },
        },
      },
    ]);
    expect(result.request?.body).toEqual(ws.sent[0]);

    ws.message({ type: 'session.updated', session: { id: 'sess_1' } });
    await flush();
    await flush();
    expect(ws.types()).toEqual([
      'session.update',
      'input_audio_buffer.append',
      'input_audio_buffer.commit',
    ]);
    expect(ws.sent[1].audio).toBe(Buffer.from(pcm).toString('base64'));

    ws.message({ type: 'input_audio_buffer.committed', item_id: 'item_1' });
    ws.message({
      type: `${transcription}.delta`,
      item_id: 'item_1',
      delta: 'Hello',
    });
    ws.message({
      type: `${transcription}.intermediate`,
      item_id: 'item_1',
      content_index: 0,
      intermediate: ' wor',
    });
    ws.message({
      type: `${transcription}.delta`,
      item_id: 'item_1',
      delta: ' world.',
    });
    ws.message({
      type: `${transcription}.completed`,
      item_id: 'item_1',
      transcript: 'Hello world.',
    });

    expect(await parts).toEqual([
      { type: 'stream-start', warnings: [] },
      { type: 'transcript-delta', id: 'item_1', delta: 'Hello' },
      { type: 'transcript-partial', id: 'item_1', text: ' wor' },
      { type: 'transcript-delta', id: 'item_1', delta: ' world.' },
      { type: 'transcript-final', id: 'item_1', text: 'Hello world.' },
      {
        type: 'finish',
        text: 'Hello world.',
        segments: [],
        language: 'en',
        durationInSeconds: 1,
      },
    ]);
    expect(ws.close).toHaveBeenCalledWith(1000);
  });

  it('does not send audio before the session update is acknowledged', async () => {
    const { ws } = await startStream();
    ws.open();
    ws.message({ type: 'session.created' });
    await flush();
    await flush();
    expect(ws.types()).toEqual(['session.update']);
  });

  it('counts base64 audio chunks toward the duration at 16 kHz', async () => {
    const chunk = Buffer.from(new Uint8Array(16_000)).toString('base64');
    const { parts, ws } = await startStream({
      audio: [chunk, chunk],
      rate: 16000,
    });
    await configureSession(ws);
    expect(
      ws.sent.filter(event => event.type === 'input_audio_buffer.append'),
    ).toEqual([
      { type: 'input_audio_buffer.append', audio: chunk },
      { type: 'input_audio_buffer.append', audio: chunk },
    ]);
    ws.message({
      type: `${transcription}.completed`,
      item_id: 'i',
      transcript: 'Hi',
    });
    expect((await parts).at(-1)).toMatchObject({
      type: 'finish',
      text: 'Hi',
      durationInSeconds: 1,
    });
  });

  it('falls back to accumulated deltas when the completed event has no transcript', async () => {
    const { parts, ws } = await startStream();
    await configureSession(ws);
    ws.message({
      type: `${transcription}.delta`,
      item_id: 'i',
      delta: 'Hello',
    });
    ws.message({ type: `${transcription}.completed`, item_id: 'i' });
    expect((await parts).at(-1)).toMatchObject({
      type: 'finish',
      text: 'Hello',
    });
  });

  it('finishes without committing when there is no audio', async () => {
    const { parts, ws } = await startStream({ audio: [] });
    await configureSession(ws);
    expect(ws.types()).toEqual(['session.update']);
    expect((await parts).at(-1)).toEqual({
      type: 'finish',
      text: '',
      segments: [],
      language: undefined,
    });
  });

  it('emits raw events when requested', async () => {
    const { parts, ws } = await startStream({ includeRawChunks: true });
    await configureSession(ws);
    ws.message({
      type: `${transcription}.completed`,
      item_id: 'i',
      transcript: 'Hi',
    });
    expect((await parts).filter(part => part.type === 'raw')).toHaveLength(3);
  });

  it('fails the stream on transcription failures', async () => {
    const { parts, ws } = await startStream();
    await configureSession(ws);
    ws.message({
      type: `${transcription}.failed`,
      item_id: 'i',
      error: {
        type: 'server_error',
        code: 'DeploymentNotFound',
        message: 'Input transcription failed.',
      },
    });
    await expect(parts).rejects.toThrow(
      'Azure MAI transcription error (DeploymentNotFound): Input transcription failed.',
    );
  });

  it('fails the stream on error events', async () => {
    const { parts, ws } = await startStream();
    ws.open();
    ws.message({
      type: 'error',
      error: {
        type: 'invalid_request_error',
        code: 'invalid_value',
        message:
          'PCM input rate must be 24000, or 16000 for MAI transcription.',
      },
    });
    await expect(parts).rejects.toThrow(
      'Azure MAI transcription error (invalid_value): PCM input rate must be 24000, or 16000 for MAI transcription.',
    );
  });

  it('fails the stream when the connection closes before the transcript completes', async () => {
    const { parts, ws } = await startStream();
    await configureSession(ws);
    ws.onclose?.({ code: 1011, reason: 'server error' });
    await expect(parts).rejects.toThrow(
      'Azure MAI transcription connection closed before the transcript completed (code 1011: server error)',
    );
  });

  it('closes the socket when aborted', async () => {
    const controller = new AbortController();
    const { parts, ws } = await startStream({ abortSignal: controller.signal });
    await configureSession(ws);
    controller.abort(new Error('stop'));
    await expect(parts).rejects.toThrow('stop');
    expect(ws.close).toHaveBeenCalled();
  });

  it('warns about file-transcription options', async () => {
    const { parts, ws } = await startStream({
      providerOptions: { azure: { timestamps: 'word' } },
    });
    await configureSession(ws);
    ws.message({
      type: `${transcription}.completed`,
      item_id: 'i',
      transcript: 'Hi',
    });
    expect((await parts)[0]).toEqual({
      type: 'stream-start',
      warnings: [
        {
          type: 'unsupported',
          feature: 'providerOptions.azure.timestamps',
          details: 'This option requires the Azure Speech API.',
        },
      ],
    });
  });

  it.each([
    [{ type: 'audio/pcmu' }, 'got audio/pcmu'],
    [{ type: 'audio/pcm', rate: 8000 }, 'got audio/pcm at 8000 Hz'],
  ])('rejects unsupported input audio %j', async (inputAudioFormat, detail) => {
    const model = setup().transcription('mai-transcribe-2-streaming');
    const call = Promise.resolve(
      model.doStream!({
        audio: convertArrayToReadableStream([pcm]),
        inputAudioFormat,
      }),
    );
    await expect(call).rejects.toBeInstanceOf(InvalidArgumentError);
    await expect(call).rejects.toThrow(detail);
    expect(MockWebSocket.instances).toHaveLength(0);
  });
});

describe('MAI connection settings', () => {
  it('uses maiBaseURL for the realtime endpoint', async () => {
    const { ws } = await startStream({
      settings: {
        maiBaseURL: 'https://my-foundry.services.ai.azure.com/mai/v1/',
      },
    });
    expect(String(ws.url)).toBe(
      'wss://my-foundry.services.ai.azure.com/mai/v1/realtime?intent=transcription',
    );
  });

  it('moves the key to the query string for native WebSocket', async () => {
    vi.stubGlobal('WebSocket', MockWebSocket);
    const { ws } = await startStream({ settings: { webSocket: undefined } });
    const url = new URL(String(ws.url));
    expect(url.searchParams.get('api-key')).toBe('test-key');
    expect(url.searchParams.get('intent')).toBe('transcription');
    expect(ws.options?.headers?.['api-key']).toBeUndefined();
  });

  it('sends an Entra bearer token', async () => {
    const { ws } = await startStream({
      settings: { apiKey: undefined, tokenProvider: async () => 'entra-token' },
    });
    expect(ws.options?.headers?.authorization).toBe('Bearer entra-token');
    expect(ws.options?.headers?.['api-key']).toBeUndefined();
  });

  it('routes custom deployment names with api=mai', async () => {
    const { ws } = await startStream({
      modelId: 'my-streaming-deployment',
      providerOptions: { azure: { api: 'mai' } },
    });
    ws.open();
    ws.message({ type: 'session.created' });
    await flush();
    expect(ws.sent[0]).toMatchObject({
      session: {
        audio: {
          input: { transcription: { model: 'my-streaming-deployment' } },
        },
      },
    });
  });
});

describe('MAI routing', () => {
  it('rejects file transcription for the streaming model', async () => {
    await expect(
      setup()
        .transcription('MAI-Transcribe-2-Streaming')
        .doGenerate({ audio: new Uint8Array([1]), mediaType: 'audio/wav' }),
    ).rejects.toBeInstanceOf(UnsupportedFunctionalityError);
  });

  it('warns about the MAI language option on file transcription', async () => {
    const fetch = vi.fn(async () =>
      Response.json({
        combinedPhrases: [{ text: 'Hi' }],
        durationMilliseconds: 1000,
      }),
    );
    const result = await setup({ fetch })
      .transcription('mai-transcribe-2')
      .doGenerate({
        audio: new Uint8Array([1]),
        mediaType: 'audio/wav',
        providerOptions: { azure: { language: 'en' } },
      });
    expect(result.warnings).toEqual([
      {
        type: 'unsupported',
        feature: 'providerOptions.azure.language',
        details: 'This option requires MAI streaming transcription.',
      },
    ]);
  });
});
