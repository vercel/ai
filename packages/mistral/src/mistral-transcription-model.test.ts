import { InvalidArgumentError } from '@ai-sdk/provider';
import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import fs from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { createMistral } from './mistral-provider';
import { MistralTranscriptionModel } from './mistral-transcription-model';

vi.mock('./version', () => ({
  VERSION: '0.0.0-test',
}));

const modelId = 'voxtral-mini-latest';
const url = 'https://api.mistral.ai/v1/audio/transcriptions';
const audioData = new Uint8Array([0, 1, 2, 3, 4]);
const transcriptionResponse = JSON.parse(
  fs.readFileSync('src/__fixtures__/mistral-transcription.json', 'utf8'),
);
const provider = createMistral({ apiKey: 'test-api-key' });
const model = provider.transcription(modelId);

const server = createTestServer({
  [url]: {},
});

describe('MistralTranscriptionModel', () => {
  it('should expose correct provider and model information', () => {
    expect(model.provider).toBe('mistral.transcription');
    expect(model.modelId).toBe(modelId);
    expect(model.specificationVersion).toBe('v4');
  });

  it('should create transcription models through both provider factories', () => {
    expect(provider.transcription(modelId)).toBeInstanceOf(
      MistralTranscriptionModel,
    );
    expect(provider.transcriptionModel(modelId)).toBeInstanceOf(
      MistralTranscriptionModel,
    );
  });
});

describe('doGenerate', () => {
  function prepareJsonResponse({
    body = transcriptionResponse,
    headers,
  }: {
    body?: Record<string, unknown>;
    headers?: Record<string, string>;
  } = {}) {
    server.urls[url].response = {
      type: 'json-value',
      headers,
      body,
    };
  }

  it('should send Uint8Array audio as a multipart file', async () => {
    prepareJsonResponse();

    await model.doGenerate({
      audio: audioData,
      mediaType: 'audio/wav',
    });

    const multipart = await server.calls[0].requestBodyMultipart;
    expect(server.calls[0].requestMethod).toBe('POST');
    expect(server.calls[0].requestUrl).toBe(url);
    expect(multipart).toMatchObject({ model: modelId });
    expect(multipart!.file).toBeInstanceOf(File);
    expect(multipart!.file.type).toBe('audio/wav');
    expect(multipart!.file.name).toBe('audio.wav');
    expect(multipart!.file.size).toBe(5);
  });

  it('should send base64 audio with a media-type-derived filename', async () => {
    prepareJsonResponse();

    await model.doGenerate({
      audio: 'aGVsbG8=',
      mediaType: 'audio/mp4',
    });

    const multipart = await server.calls[0].requestBodyMultipart;
    expect(multipart!.file).toBeInstanceOf(File);
    expect(multipart!.file.type).toBe('audio/mp4');
    expect(multipart!.file.name).toBe('audio.m4a');
    expect(multipart!.file.size).toBe(5);
  });

  it('should pass provider options as Mistral multipart fields', async () => {
    let capturedFormData: FormData | undefined;
    const customFetch = vi.fn<typeof globalThis.fetch>(async (_url, init) => {
      capturedFormData = init?.body as FormData;
      return new Response(JSON.stringify(transcriptionResponse), {
        headers: { 'content-type': 'application/json' },
      });
    });
    const customModel = createMistral({
      apiKey: 'test-api-key',
      fetch: customFetch,
    }).transcription(modelId);

    await customModel.doGenerate({
      audio: audioData,
      mediaType: 'audio/wav',
      providerOptions: {
        mistral: {
          temperature: 0.2,
          timestampGranularities: ['segment', 'word'],
          diarize: true,
          contextBias: ['Vercel', 'AI_SDK'],
        },
      },
    });

    expect(capturedFormData!.get('temperature')).toBe('0.2');
    expect(capturedFormData!.getAll('timestamp_granularities')).toEqual([
      'segment',
      'word',
    ]);
    expect(capturedFormData!.get('diarize')).toBe('true');
    expect(capturedFormData!.getAll('context_bias')).toEqual([
      'Vercel',
      'AI_SDK',
    ]);
  });

  it('should reject context bias items with commas or whitespace', async () => {
    await expect(
      model.doGenerate({
        audio: audioData,
        mediaType: 'audio/wav',
        providerOptions: {
          mistral: {
            contextBias: ['AI SDK'],
          },
        },
      }),
    ).rejects.toThrow('invalid mistral provider options');
  });

  it('should pass language when timestamp granularities are not set', async () => {
    prepareJsonResponse();

    await model.doGenerate({
      audio: audioData,
      mediaType: 'audio/wav',
      providerOptions: {
        mistral: {
          language: 'en',
        },
      },
    });

    expect(await server.calls[0].requestBodyMultipart).toMatchObject({
      language: 'en',
    });
  });

  it('should reject language combined with timestamp granularities', async () => {
    await expect(
      model.doGenerate({
        audio: audioData,
        mediaType: 'audio/wav',
        providerOptions: {
          mistral: {
            language: 'en',
            timestampGranularities: ['segment'],
          },
        },
      }),
    ).rejects.toSatisfy(InvalidArgumentError.isInstance);
  });

  it('should pass headers, abort signal, and the Mistral user agent', async () => {
    prepareJsonResponse();
    const abortController = new AbortController();
    const customFetch = vi.fn<typeof globalThis.fetch>(fetch);
    const customProvider = createMistral({
      apiKey: 'test-api-key',
      headers: {
        'Custom-Provider-Header': 'provider-header-value',
      },
      fetch: customFetch,
    });

    await customProvider.transcription(modelId).doGenerate({
      audio: audioData,
      mediaType: 'audio/wav',
      abortSignal: abortController.signal,
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
    expect(customFetch.mock.calls[0]![1]?.signal).toBe(abortController.signal);
  });

  it('should use a custom base URL and fetch implementation', async () => {
    const customFetch = vi.fn<typeof globalThis.fetch>(async () => {
      return new Response(JSON.stringify(transcriptionResponse), {
        headers: { 'content-type': 'application/json' },
      });
    });
    const customProvider = createMistral({
      apiKey: 'test-api-key',
      baseURL: 'https://custom.mistral.example/v2/',
      fetch: customFetch,
    });

    await customProvider.transcription(modelId).doGenerate({
      audio: audioData,
      mediaType: 'audio/wav',
    });

    expect(customFetch).toHaveBeenCalledOnce();
    expect(customFetch.mock.calls[0]![0]).toBe(
      'https://custom.mistral.example/v2/audio/transcriptions',
    );
  });

  it('should map transcript fields, usage, diarization, and response metadata', async () => {
    prepareJsonResponse({
      headers: {
        'x-request-id': 'test-request-id',
      },
    });
    const testDate = new Date(0);
    const customModel = new MistralTranscriptionModel(modelId, {
      provider: 'mistral.transcription',
      baseURL: 'https://api.mistral.ai/v1',
      headers: () => ({ authorization: 'Bearer test-api-key' }),
      _internal: {
        currentDate: () => testDate,
      },
    });

    const result = await customModel.doGenerate({
      audio: audioData,
      mediaType: 'audio/wav',
    });

    expect(result.text).toBe(transcriptionResponse.text);
    expect(result.language).toBeUndefined();
    expect(result.segments).toEqual(
      transcriptionResponse.segments.map(
        (segment: { text: string; start: number; end: number }) => ({
          text: segment.text,
          startSecond: segment.start,
          endSecond: segment.end,
        }),
      ),
    );
    expect(result.durationInSeconds).toBe(36);
    expect(result.warnings).toEqual([]);
    expect(result.response).toEqual({
      timestamp: testDate,
      modelId: 'voxtral-mini-latest',
      headers: {
        'content-length': expect.any(String),
        'content-type': 'application/json',
        'x-request-id': 'test-request-id',
      },
      body: transcriptionResponse,
    });
    expect(result.providerMetadata).toEqual({
      mistral: {
        usage: {
          promptTokens: 13,
          completionTokens: 151,
          totalTokens: 164,
          promptAudioSeconds: 36,
          requestCount: 1,
        },
        segments: transcriptionResponse.segments.map(
          (segment: {
            type: string;
            text: string;
            start: number;
            end: number;
            speaker_id: string;
          }) => ({
            type: segment.type,
            text: segment.text,
            startSecond: segment.start,
            endSecond: segment.end,
            speakerId: segment.speaker_id,
          }),
        ),
      },
    });
  });

  it('should handle nullable response fields and use the last segment for duration', async () => {
    prepareJsonResponse({
      body: {
        model: 'voxtral-mini-transcribe-2602',
        text: 'Hello.',
        language: null,
        segments: [
          {
            text: 'Hello.',
            start: 0,
            end: 2.5,
            score: null,
            speaker_id: null,
          },
        ],
        usage: null,
      },
    });

    const result = await model.doGenerate({
      audio: audioData,
      mediaType: 'audio/wav',
    });

    expect(result.language).toBeUndefined();
    expect(result.durationInSeconds).toBe(2.5);
    expect(result.providerMetadata).toBeUndefined();
  });
});
