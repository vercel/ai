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

  it('should accept phrases, punctuation, and more than 100 context bias entries', async () => {
    prepareJsonResponse();
    const contextBias = [
      'AI SDK',
      'A conversation about Vercel, TypeScript, and speech.',
      ...Array.from({ length: 100 }, (_, i) => `Product ${i}`),
    ];
    let capturedFormData: FormData | undefined;
    const customModel = createMistral({
      apiKey: 'test-api-key',
      fetch: async (url, init) => {
        capturedFormData = init?.body as FormData;
        return fetch(url, init);
      },
    }).transcription('voxtral-mini-transcribe-3-0');

    await customModel.doGenerate({
      audio: audioData,
      mediaType: 'audio/wav',
      providerOptions: { mistral: { contextBias } },
    });

    expect(capturedFormData!.getAll('context_bias')).toEqual(contextBias);
  });

  it('should reject empty context bias entries', async () => {
    await expect(
      model.doGenerate({
        audio: audioData,
        mediaType: 'audio/wav',
        providerOptions: {
          mistral: {
            contextBias: [''],
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

  it.each(['voxtral-mini-2507', 'voxtral-mini-2602', 'voxtral-mini-latest'])(
    'should reject language combined with timestamps for %s',
    async legacyModelId => {
      await expect(
        provider.transcription(legacyModelId).doGenerate({
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
    },
  );

  it.each([
    'voxtral-mini-transcribe-4-0',
    'voxtral-small-transcribe-3-1',
    'custom-transcription-model',
  ])(
    'should allow language combined with timestamps for unrecognized model %s',
    async unknownModelId => {
      prepareJsonResponse();
      await provider.transcription(unknownModelId).doGenerate({
        audio: audioData,
        mediaType: 'audio/wav',
        providerOptions: {
          mistral: {
            language: 'en',
            timestampGranularities: ['segment'],
          },
        },
      });
      expect(await server.calls[0].requestBodyMultipart).toMatchObject({
        model: unknownModelId,
        language: 'en',
        timestamp_granularities: 'segment',
      });
    },
  );

  describe.each([
    'voxtral-mini-transcribe-3-0',
    'voxtral-mini-transcribe-3',
    'voxtral-mini-transcribe-latest',
    'voxtral-small-transcribe-3-0',
    'voxtral-small-transcribe-3',
    'voxtral-small-transcribe-latest',
  ])('%s', voxtral3ModelId => {
    const voxtral3Model = provider.transcription(voxtral3ModelId);

    it('should allow language with segment timestamps and diarization', async () => {
      prepareJsonResponse();
      await voxtral3Model.doGenerate({
        audio: audioData,
        mediaType: 'audio/wav',
        providerOptions: {
          mistral: {
            language: 'en',
            returnLanguage: false,
            timestampGranularities: ['segment'],
            diarize: true,
          },
        },
      });
      expect(await server.calls[0].requestBodyMultipart).toMatchObject({
        model: voxtral3ModelId,
        language: 'en',
        return_language: 'false',
        timestamp_granularities: 'segment',
        diarize: 'true',
      });
    });

    it('should forward word timestamps for the API to validate', async () => {
      prepareJsonResponse();
      await voxtral3Model.doGenerate({
        audio: audioData,
        mediaType: 'audio/wav',
        providerOptions: { mistral: { timestampGranularities: ['word'] } },
      });
      expect(await server.calls[0].requestBodyMultipart).toMatchObject({
        timestamp_granularities: 'word',
      });
    });

    it('should forward diarization without timestamps for the API to validate', async () => {
      prepareJsonResponse();
      await voxtral3Model.doGenerate({
        audio: audioData,
        mediaType: 'audio/wav',
        providerOptions: { mistral: { diarize: true } },
      });
      const multipart = await server.calls[0].requestBodyMultipart;
      expect(multipart).toMatchObject({ diarize: 'true' });
      expect(multipart).not.toHaveProperty('timestamp_granularities');
    });
  });

  it('should request and return the detected language', async () => {
    prepareJsonResponse({ body: { ...transcriptionResponse, language: 'en' } });
    const result = await provider
      .transcription('voxtral-mini-transcribe-3-0')
      .doGenerate({
        audio: audioData,
        mediaType: 'audio/wav',
        providerOptions: { mistral: { returnLanguage: true } },
      });
    expect(await server.calls[0].requestBodyMultipart).toMatchObject({
      return_language: 'true',
    });
    expect(result.language).toBe('en');
  });

  it('should reject language prediction when the language is pinned', async () => {
    await expect(
      provider.transcription('voxtral-mini-transcribe-3-0').doGenerate({
        audio: audioData,
        mediaType: 'audio/wav',
        providerOptions: { mistral: { language: 'en', returnLanguage: true } },
      }),
    ).rejects.toThrow(
      'providerOptions.mistral.language cannot be combined with providerOptions.mistral.returnLanguage',
    );
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
      'ai-sdk-mistral/0.0.0-test',
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
    expect(result.usage).toStrictEqual(transcriptionResponse.usage);
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
