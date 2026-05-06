import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import { describe, expect, it, vi } from 'vitest';
import { createMistral } from './mistral-provider';
import { MistralTranscriptionModel } from './mistral-transcription-model';

vi.mock('./version', () => ({
  VERSION: '0.0.0-test',
}));

const audioData = new Uint8Array([0, 1, 2, 3, 4]);
const transcriptionResponse = {
  model: 'voxtral-mini-2507',
  text: 'Hello from the Vercel AI SDK.',
  language: 'en',
  segments: [
    {
      text: 'Hello from the Vercel AI SDK.',
      start: 0,
      end: 1.25,
      type: 'transcription_segment',
    },
  ],
  usage: {
    prompt_audio_seconds: 1,
    prompt_tokens: 4,
    completion_tokens: 6,
    total_tokens: 10,
  },
};

const server = createTestServer({
  'https://api.mistral.ai/v1/audio/transcriptions': {
    response: {
      type: 'json-value',
      headers: {
        'x-request-id': 'request-id',
      },
      body: transcriptionResponse,
    },
  },
});

function createModel({
  headers,
  currentDate,
  baseURL,
}: {
  headers?: () => Record<string, string | undefined>;
  currentDate?: () => Date;
  baseURL?: string;
} = {}) {
  return new MistralTranscriptionModel('voxtral-mini-latest', {
    provider: 'mistral.transcription',
    baseURL: baseURL ?? 'https://api.mistral.ai/v1',
    headers: headers ?? (() => ({ authorization: 'Bearer test-api-key' })),
    _internal: {
      currentDate,
    },
  });
}

describe('MistralTranscriptionModel', () => {
  it('should expose correct provider and model information', () => {
    const model = createModel();

    expect(model.provider).toBe('mistral.transcription');
    expect(model.modelId).toBe('voxtral-mini-latest');
    expect(model.specificationVersion).toBe('v3');
  });

  it('should post to the Mistral transcription endpoint', async () => {
    const provider = createMistral({ apiKey: 'test-api-key' });

    await provider.transcription('voxtral-mini-latest').doGenerate({
      audio: audioData,
      mediaType: 'audio/wav',
    });

    expect(server.calls[0].requestMethod).toBe('POST');
    expect(server.calls[0].requestUrl).toBe(
      'https://api.mistral.ai/v1/audio/transcriptions',
    );
  });

  it('should pass headers', async () => {
    const provider = createMistral({
      apiKey: 'test-api-key',
      headers: {
        'Custom-Provider-Header': 'provider-header-value',
      },
    });

    await provider.transcriptionModel('voxtral-mini-latest').doGenerate({
      audio: audioData,
      mediaType: 'audio/wav',
      headers: {
        'Custom-Request-Header': 'request-header-value',
      },
    });

    expect(server.calls[0].requestHeaders).toMatchObject({
      authorization: 'Bearer test-api-key',
      'content-type': expect.stringMatching(
        /^multipart\/form-data; boundary=----formdata-undici-\d+$/,
      ),
      'custom-provider-header': 'provider-header-value',
      'custom-request-header': 'request-header-value',
    });
    expect(server.calls[0].requestUserAgent).toContain(
      'ai-sdk/mistral/0.0.0-test',
    );
  });

  it('should send Uint8Array audio as a multipart file', async () => {
    await createModel().doGenerate({
      audio: audioData,
      mediaType: 'audio/wav',
    });

    const multipart = await server.calls[0].requestBodyMultipart;

    expect(multipart).toMatchObject({
      model: 'voxtral-mini-latest',
    });
    expect(multipart!.file).toBeInstanceOf(File);
    expect(multipart!.file.type).toBe('audio/wav');
    expect(multipart!.file.name).toBe('audio.wav');
    expect(multipart!.file.size).toBe(5);
  });

  it('should send base64 audio as a multipart file', async () => {
    await createModel().doGenerate({
      audio: 'aGVsbG8=',
      mediaType: 'audio/mp4',
    });

    const multipart = await server.calls[0].requestBodyMultipart;

    expect(multipart!.file).toBeInstanceOf(File);
    expect(multipart!.file.type).toBe('audio/mp4');
    expect(multipart!.file.name).toBe('audio.m4a');
    expect(multipart!.file.size).toBe(5);
  });

  it('should pass provider options as snake_case multipart fields', async () => {
    let capturedFormData: FormData | undefined;
    const fetch = vi.fn(async (_url, init) => {
      capturedFormData = init?.body as FormData;
      return new Response(JSON.stringify(transcriptionResponse), {
        headers: { 'content-type': 'application/json' },
      });
    });
    const model = new MistralTranscriptionModel('voxtral-mini-latest', {
      provider: 'mistral.transcription',
      baseURL: 'https://api.mistral.ai/v1',
      headers: () => ({ authorization: 'Bearer test-api-key' }),
      fetch,
    });

    await model.doGenerate({
      audio: audioData,
      mediaType: 'audio/wav',
      providerOptions: {
        mistral: {
          language: 'en',
          temperature: 0.2,
          timestamp_granularities: 'segment',
          diarize: true,
          contextBias: ['Vercel', 'AI SDK'],
        },
      },
    });

    expect(Object.fromEntries(capturedFormData!.entries())).toMatchObject({
      model: 'voxtral-mini-latest',
      language: 'en',
      temperature: '0.2',
      timestamp_granularities: 'segment',
      diarize: 'true',
    });
    expect(capturedFormData!.getAll('context_bias')).toStrictEqual([
      'Vercel',
      'AI SDK',
    ]);
  });

  it('should map response fields and provider metadata', async () => {
    const testDate = new Date(0);
    const result = await createModel({
      currentDate: () => testDate,
    }).doGenerate({
      audio: audioData,
      mediaType: 'audio/wav',
    });

    expect(result).toMatchObject({
      text: 'Hello from the Vercel AI SDK.',
      language: 'en',
      segments: [
        {
          text: 'Hello from the Vercel AI SDK.',
          startSecond: 0,
          endSecond: 1.25,
        },
      ],
      durationInSeconds: 1.25,
      warnings: [],
      response: {
        timestamp: testDate,
        modelId: 'voxtral-mini-latest',
        headers: {
          'content-type': 'application/json',
          'x-request-id': 'request-id',
        },
        body: transcriptionResponse,
      },
      providerMetadata: {
        mistral: {
          usage: transcriptionResponse.usage,
        },
      },
    });
  });

  it('should fall back to usage prompt_audio_seconds for duration', async () => {
    server.urls['https://api.mistral.ai/v1/audio/transcriptions'].response = {
      type: 'json-value',
      body: {
        model: 'voxtral-mini-2507',
        text: 'Hello.',
        language: null,
        segments: [],
        usage: {
          prompt_audio_seconds: 2.5,
          prompt_tokens: 2,
          completion_tokens: 1,
          total_tokens: 3,
        },
      },
    };

    const result = await createModel().doGenerate({
      audio: audioData,
      mediaType: 'audio/wav',
    });

    expect(result.language).toBeUndefined();
    expect(result.segments).toStrictEqual([]);
    expect(result.durationInSeconds).toBe(2.5);
  });
});
