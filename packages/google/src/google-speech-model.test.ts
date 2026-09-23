import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import { createGoogle } from './google-provider';
import { GoogleSpeechModel } from './google-speech-model';
import { describe, it, expect, vi } from 'vitest';
import { convertBase64ToUint8Array } from '@ai-sdk/provider-utils';

vi.mock('./version', () => ({
  VERSION: '0.0.0-test',
}));

const provider = createGoogle({ apiKey: 'test-api-key' });
const model = provider.speech('gemini-2.5-flash-preview-tts');

const url =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent';

// 8 bytes of raw PCM ([1..8]) base64-encoded.
const PCM_BASE64 = 'AQIDBAUGBwg=';
const PCM_BYTES = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
const WAV_BASE64 =
  'UklGRiwAAABXQVZFZm10IBAAAAABAAEAwF0AAIC7AAACABAAZGF0YQgAAAABAgMEBQYHCA==';
const modernModels = [
  'gemini-3.8-flash-tts',
  'gemini-3.8-flash-lite-tts',
  'custom-tts-model',
];
const modernUrl = (id: string) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${id}:generateContent`;

const server = createTestServer<Record<string, object>>({
  [url]: {},
  ...Object.fromEntries(modernModels.map(id => [modernUrl(id), {}])),
});

function dataView(audio: Uint8Array): DataView {
  return new DataView(audio.buffer, audio.byteOffset, audio.byteLength);
}

describe('doGenerate', () => {
  it.each([
    'gemini-2.5-flash-preview-tts',
    'gemini-3.1-flash-tts-preview',
    ...modernModels,
  ])(
    'preserves raw usage including cached input tokens for %s',
    async modelId => {
      const body = {
        candidates: [
          {
            content: {
              parts: [
                { inlineData: { data: WAV_BASE64, mimeType: 'audio/wav' } },
              ],
            },
          },
        ],
        usageMetadata: {
          promptTokenCount: 6,
          cachedContentTokenCount: 5,
          candidatesTokenCount: 67,
          totalTokenCount: 73,
          candidatesTokensDetails: [{ modality: 'AUDIO', tokenCount: 67 }],
        },
      };
      const model = createGoogle({
        apiKey: 'test-api-key',
        fetch: vi
          .fn<typeof globalThis.fetch>()
          .mockResolvedValue(Response.json(body)),
      }).speech(modelId);

      const result = await model.doGenerate({ text: 'Hello.' });

      expect(result.response.body).toStrictEqual(body);
    },
  );

  it.each([
    'gemini-2.5-flash-preview-tts',
    'gemini-2.5-pro-preview-tts',
    'gemini-2.5-flash-tts',
    'gemini-3.1-flash-tts-preview',
    'gemini-3.1-flash-tts',
  ])('preserves legacy requests and PCM conversion for %s', async modelId => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      Response.json({
        candidates: [
          {
            content: {
              parts: [
                {
                  inlineData: {
                    data: PCM_BASE64,
                    mimeType: 'audio/L16;rate=24000',
                  },
                },
              ],
            },
          },
        ],
      }),
    );
    const model = createGoogle({ apiKey: 'test-api-key', fetch }).speech(
      modelId,
    );
    const result = await model.doGenerate({
      text: 'Hello.',
      instructions: 'Whisper',
      outputFormat: 'wav',
    });
    expect(JSON.parse(String(fetch.mock.calls[0][1]?.body))).toStrictEqual({
      contents: [{ role: 'user', parts: [{ text: 'Whisper: Hello.' }] }],
      generationConfig: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } },
        },
      },
    });
    expect(result.audio).toEqual(convertBase64ToUint8Array(WAV_BASE64));
  });

  it.each([
    'gemini-2.5-flash-preview-tts',
    'gemini-3.1-flash-tts-preview',
    ...modernModels,
  ])('rejects an empty transcript before fetching for %s', async modelId => {
    const fetch = vi.fn();
    const model = createGoogle({ apiKey: 'test-api-key', fetch }).speech(
      modelId,
    );

    await expect(
      model.doGenerate({ text: '', instructions: 'Whisper' }),
    ).rejects.toMatchObject({
      name: 'AI_InvalidArgumentError',
      argument: 'text',
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each(modernModels)(
    'rejects empty turns even with top-level text for %s',
    async modelId => {
      const fetch = vi.fn();
      const model = createGoogle({ apiKey: 'test-api-key', fetch }).speech(
        modelId,
      );

      await expect(
        model.doGenerate({
          text: 'Ignored',
          providerOptions: { google: { turns: [{ text: '' }] } },
        }),
      ).rejects.toMatchObject({
        name: 'AI_InvalidArgumentError',
        argument: 'text',
      });
      expect(fetch).not.toHaveBeenCalled();
    },
  );

  function prepareJsonResponse({
    headers,
    mimeType = 'audio/L16;rate=24000',
    data = PCM_BASE64,
    parts,
  }: {
    headers?: Record<string, string>;
    mimeType?: string;
    data?: string;
    parts?: Array<unknown>;
  } = {}) {
    server.urls[url].response = {
      type: 'json-value',
      headers,
      body: {
        candidates: [
          {
            content: {
              parts: parts ?? [{ inlineData: { mimeType, data } }],
            },
          },
        ],
      },
    };
  }

  it('should send the text and the default voice', async () => {
    prepareJsonResponse();

    await model.doGenerate({ text: 'Hello from the AI SDK!' });

    expect(await server.calls[0].requestBodyJson).toStrictEqual({
      contents: [{ role: 'user', parts: [{ text: 'Hello from the AI SDK!' }] }],
      generationConfig: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } },
        },
      },
    });
  });

  it('should use the provided voice', async () => {
    prepareJsonResponse();

    await model.doGenerate({ text: 'Hello from the AI SDK!', voice: 'Puck' });

    expect(await server.calls[0].requestBodyJson).toMatchObject({
      generationConfig: {
        speechConfig: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Puck' } },
        },
      },
    });
  });

  it('should pass headers', async () => {
    prepareJsonResponse();

    const provider = createGoogle({
      apiKey: 'test-api-key',
      headers: {
        'Custom-Provider-Header': 'provider-header-value',
      },
    });

    await provider.speech('gemini-2.5-flash-preview-tts').doGenerate({
      text: 'Hello from the AI SDK!',
      headers: {
        'Custom-Request-Header': 'request-header-value',
      },
    });

    expect(server.calls[0].requestHeaders).toMatchObject({
      'content-type': 'application/json',
      'x-goog-api-key': 'test-api-key',
      'custom-provider-header': 'provider-header-value',
      'custom-request-header': 'request-header-value',
    });
    expect(server.calls[0].requestUserAgent).toContain(
      'ai-sdk/google/0.0.0-test',
    );
  });

  it('should wrap PCM audio in a WAV container by default', async () => {
    prepareJsonResponse();

    const result = await model.doGenerate({ text: 'Hello from the AI SDK!' });
    const audio = result.audio as Uint8Array;

    // 44-byte WAV header + 8 bytes PCM payload.
    expect(audio.length).toBe(52);
    expect(Array.from(audio.slice(0, 4))).toEqual([0x52, 0x49, 0x46, 0x46]); // "RIFF"
    expect(Array.from(audio.slice(8, 12))).toEqual([0x57, 0x41, 0x56, 0x45]); // "WAVE"

    const view = dataView(audio);
    expect(view.getUint32(24, true)).toBe(24000); // sample rate
    expect(view.getUint16(22, true)).toBe(1); // mono
    expect(view.getUint16(34, true)).toBe(16); // bits per sample

    // PCM payload is preserved after the header.
    expect(Array.from(audio.slice(44))).toEqual(Array.from(PCM_BYTES));
  });

  it('should preserve WAV responses even from older models', async () => {
    prepareJsonResponse({ mimeType: 'audio/wav', data: WAV_BASE64 });
    const result = await model.doGenerate({ text: 'Hello' });
    expect(result.audio).toEqual(convertBase64ToUint8Array(WAV_BASE64));
  });

  it('should derive the WAV sample rate from the response mime type', async () => {
    prepareJsonResponse({ mimeType: 'audio/L16;rate=16000' });

    const result = await model.doGenerate({ text: 'Hello from the AI SDK!' });
    const audio = result.audio as Uint8Array;

    expect(dataView(audio).getUint32(24, true)).toBe(16000);
  });

  it('should return raw PCM and warn for outputFormat "pcm"', async () => {
    prepareJsonResponse();

    const result = await model.doGenerate({
      text: 'Hello from the AI SDK!',
      outputFormat: 'pcm',
    });

    expect(result.audio).toStrictEqual(PCM_BYTES);
    expect(result.warnings).toContainEqual(
      expect.objectContaining({ type: 'unsupported', feature: 'outputFormat' }),
    );
  });

  it('should warn for unsupported speed and language options', async () => {
    prepareJsonResponse();

    const result = await model.doGenerate({
      text: 'Hello from the AI SDK!',
      speed: 1.5,
      language: 'en',
    });

    expect(result.warnings).toContainEqual(
      expect.objectContaining({ type: 'unsupported', feature: 'speed' }),
    );
    expect(result.warnings).toContainEqual(
      expect.objectContaining({ type: 'unsupported', feature: 'language' }),
    );
  });

  it('should prepend instructions to the prompt text', async () => {
    prepareJsonResponse();

    await model.doGenerate({
      text: 'Hello there',
      instructions: 'Say cheerfully',
    });

    expect(await server.calls[0].requestBodyJson).toMatchObject({
      contents: [
        { role: 'user', parts: [{ text: 'Say cheerfully: Hello there' }] },
      ],
    });
  });

  it('should map multi-speaker provider options into speechConfig', async () => {
    prepareJsonResponse();

    const multiSpeakerVoiceConfig = {
      speakerVoiceConfigs: [
        {
          speaker: 'Joe',
          voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } },
        },
        {
          speaker: 'Jane',
          voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Puck' } },
        },
      ],
    };

    await model.doGenerate({
      text: 'Joe: Hi. Jane: Hello.',
      providerOptions: { google: { multiSpeakerVoiceConfig } },
    });

    // toStrictEqual proves the single-voice `voiceConfig` is absent.
    expect(await server.calls[0].requestBodyJson).toStrictEqual({
      contents: [{ role: 'user', parts: [{ text: 'Joe: Hi. Jane: Hello.' }] }],
      generationConfig: {
        responseModalities: ['AUDIO'],
        speechConfig: { multiSpeakerVoiceConfig },
      },
    });
  });

  it('should read provider options under `googleVertex` for a Vertex provider', async () => {
    prepareJsonResponse();

    // Vertex reuses this model with a `google.vertex.*` provider name, so it
    // reads provider options under `googleVertex` (like the Vertex language
    // model), not `google`.
    const vertexModel = new GoogleSpeechModel('gemini-2.5-flash-preview-tts', {
      provider: 'google.vertex.speech',
      baseURL: 'https://generativelanguage.googleapis.com/v1beta',
      headers: () => ({ 'x-goog-api-key': 'test-api-key' }),
    });

    const multiSpeakerVoiceConfig = {
      speakerVoiceConfigs: [
        {
          speaker: 'Joe',
          voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } },
        },
        {
          speaker: 'Jane',
          voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Puck' } },
        },
      ],
    };

    await vertexModel.doGenerate({
      text: 'Joe: Hi. Jane: Hello.',
      providerOptions: { googleVertex: { multiSpeakerVoiceConfig } },
    });

    expect(await server.calls[0].requestBodyJson).toStrictEqual({
      contents: [{ role: 'user', parts: [{ text: 'Joe: Hi. Jane: Hello.' }] }],
      generationConfig: {
        responseModalities: ['AUDIO'],
        speechConfig: { multiSpeakerVoiceConfig },
      },
    });
  });

  it('should ignore instructions (with a warning) when multi-speaker is set', async () => {
    prepareJsonResponse();

    const result = await model.doGenerate({
      text: 'Joe: Hi. Jane: Hello.',
      instructions: 'Say cheerfully',
      providerOptions: {
        google: {
          multiSpeakerVoiceConfig: {
            speakerVoiceConfigs: [
              {
                speaker: 'Joe',
                voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } },
              },
              {
                speaker: 'Jane',
                voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Puck' } },
              },
            ],
          },
        },
      },
    });

    // instructions are NOT prepended to the multi-speaker transcript.
    expect(await server.calls[0].requestBodyJson).toMatchObject({
      contents: [{ role: 'user', parts: [{ text: 'Joe: Hi. Jane: Hello.' }] }],
    });
    expect(result.warnings).toContainEqual(
      expect.objectContaining({ type: 'unsupported', feature: 'instructions' }),
    );
  });

  it('should expose sample rate and mime type in provider metadata', async () => {
    prepareJsonResponse();

    const result = await model.doGenerate({ text: 'Hello from the AI SDK!' });

    expect(result.providerMetadata).toStrictEqual({
      google: { sampleRate: 24000, mimeType: 'audio/L16;rate=24000' },
    });
  });

  it('should return empty audio when no inline data is present', async () => {
    prepareJsonResponse({ parts: [{ text: 'no audio here' }] });

    const result = await model.doGenerate({ text: 'Hello from the AI SDK!' });

    expect(result.audio).toStrictEqual(new Uint8Array(0));
  });

  it('should include response data with timestamp, modelId and headers', async () => {
    prepareJsonResponse({ headers: { 'x-request-id': 'test-request-id' } });

    const testDate = new Date(0);
    const customModel = new GoogleSpeechModel('gemini-2.5-flash-preview-tts', {
      provider: 'google.generative-ai.speech',
      baseURL: 'https://generativelanguage.googleapis.com/v1beta',
      headers: () => ({ 'x-goog-api-key': 'test-api-key' }),
      _internal: {
        currentDate: () => testDate,
      },
    });

    const result = await customModel.doGenerate({
      text: 'Hello from the AI SDK!',
    });

    expect(result.response).toMatchObject({
      timestamp: testDate,
      modelId: 'gemini-2.5-flash-preview-tts',
      headers: expect.objectContaining({ 'x-request-id': 'test-request-id' }),
    });
  });

  it('should use the real date when no custom date provider is specified', async () => {
    prepareJsonResponse();

    const beforeDate = new Date();
    const result = await model.doGenerate({ text: 'Hello from the AI SDK!' });
    const afterDate = new Date();

    expect(result.response.timestamp.getTime()).toBeGreaterThanOrEqual(
      beforeDate.getTime(),
    );
    expect(result.response.timestamp.getTime()).toBeLessThanOrEqual(
      afterDate.getTime(),
    );
    expect(result.response.modelId).toBe('gemini-2.5-flash-preview-tts');
  });

  it('should have no warnings on the happy path', async () => {
    prepareJsonResponse();

    const result = await model.doGenerate({ text: 'Hello from the AI SDK!' });

    expect(result.warnings).toEqual([]);
  });
});

describe.each(modernModels)('%s', modelId => {
  const modernModel = provider.speech(modelId);
  const multiSpeakerVoiceConfig = {
    speakerVoiceConfigs: [
      {
        speaker: 'Joe',
        voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } },
      },
      {
        speaker: 'Jane',
        voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Puck' } },
      },
    ],
  };

  function prepareResponse(mimeType = 'audio/wav', data = WAV_BASE64) {
    server.urls[modernUrl(modelId)].response = {
      type: 'json-value',
      body: {
        candidates: [
          { content: { parts: [{ inlineData: { mimeType, data } }] } },
        ],
      },
    };
  }

  it('preserves the transcript and maps instructions to speech metadata', async () => {
    prepareResponse();
    const result = await modernModel.doGenerate({
      text: 'Hello. <laugh> How are you? <short pause>',
      instructions: 'whispering',
    });
    expect(await server.calls[0].requestBodyJson).toStrictEqual({
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: 'Hello. <laugh> How are you? <short pause>',
              speechMetadata: { style: 'whispering' },
            },
          ],
        },
      ],
      generationConfig: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } },
        },
      },
    });
    expect(result.audio).toEqual(convertBase64ToUint8Array(WAV_BASE64));
    expect(result.warnings).toEqual([]);
  });

  it('allows an empty style to override instructions', async () => {
    prepareResponse();
    await modernModel.doGenerate({
      text: 'Hello',
      instructions: 'excited',
      providerOptions: { google: { speechMetadata: { style: '' } } },
    });
    expect(await server.calls[0].requestBodyJson).toMatchObject({
      contents: [{ parts: [{ text: 'Hello', speechMetadata: { style: '' } }] }],
    });
  });

  it.each(['voice_custom', 'voicekey_custom'])(
    'supports custom voice %s',
    async voice => {
      prepareResponse();
      await modernModel.doGenerate({ text: 'Hello', voice });
      const request = await server.calls[0].requestBodyJson;
      expect(request.generationConfig.speechConfig.voiceConfig).toStrictEqual({
        voice,
      });
    },
  );

  it('sends separate turns with explicit speakers and per-turn styles', async () => {
    prepareResponse();
    const result = await modernModel.doGenerate({
      text: '',
      instructions: 'speaking slowly',
      providerOptions: {
        google: {
          multiSpeakerVoiceConfig,
          turns: [
            { text: 'Hi.', speechMetadata: { speaker: 'Joe' } },
            {
              text: '<sigh> Hello.',
              speechMetadata: { speaker: 'Jane', style: '' },
            },
          ],
        },
      },
    });
    expect(await server.calls[0].requestBodyJson).toMatchObject({
      contents: [
        {
          parts: [
            {
              text: 'Hi.',
              speechMetadata: { speaker: 'Joe', style: 'speaking slowly' },
            },
            {
              text: '<sigh> Hello.',
              speechMetadata: { speaker: 'Jane', style: '' },
            },
          ],
        },
      ],
      generationConfig: { speechConfig: { multiSpeakerVoiceConfig } },
    });
    expect(result.warnings).toEqual([]);
  });

  it.each([undefined, 'Unknown'])(
    'rejects missing or unconfigured speaker %s',
    async speaker => {
      await expect(
        modernModel.doGenerate({
          text: '',
          providerOptions: {
            google: {
              multiSpeakerVoiceConfig,
              turns: [
                {
                  text: 'Hello',
                  speechMetadata: speaker == null ? {} : { speaker },
                },
              ],
            },
          },
        }),
      ).rejects.toThrow('Every multi-speaker turn must specify');
      expect(server.calls).toHaveLength(0);
    },
  );

  it('rejects a labelled transcript without structured speakers', async () => {
    await expect(
      modernModel.doGenerate({
        text: 'Joe: Hi. Jane: Hello.',
        providerOptions: { google: { multiSpeakerVoiceConfig } },
      }),
    ).rejects.toThrow('Every multi-speaker turn must specify');
    expect(server.calls).toHaveLength(0);
  });

  it('rejects conflicting global and per-turn metadata', async () => {
    await expect(
      modernModel.doGenerate({
        text: '',
        providerOptions: {
          google: {
            speechMetadata: { style: 'excited' },
            turns: [{ text: 'Hello' }],
          },
        },
      }),
    ).rejects.toThrow('Set speechMetadata on each turn');
  });

  it('warns when turns replace nonempty top-level text', async () => {
    prepareResponse();
    const result = await modernModel.doGenerate({
      text: 'Ignored',
      providerOptions: { google: { turns: [{ text: 'Spoken' }] } },
    });
    expect(result.warnings).toContainEqual(
      expect.objectContaining({ feature: 'text' }),
    );
    expect(await server.calls[0].requestBodyJson).toMatchObject({
      contents: [{ parts: [{ text: 'Spoken' }] }],
    });
  });

  it.each([
    ['pcm', 'AUDIO_L16', 'audio/l16'],
    ['audio/l16', 'AUDIO_L16', 'audio/l16'],
    ['mulaw', 'AUDIO_MULAW', 'audio/mulaw'],
    ['audio/mulaw', 'AUDIO_MULAW', 'audio/mulaw'],
    ['alaw', 'AUDIO_ALAW', 'audio/alaw'],
    ['audio/alaw', 'AUDIO_ALAW', 'audio/alaw'],
  ])(
    'requests %s and preserves raw bytes',
    async (outputFormat, mimeType, responseMimeType) => {
      prepareResponse(
        `${responseMimeType}; rate=24000; channels=1`,
        PCM_BASE64,
      );
      const result = await modernModel.doGenerate({
        text: 'Hello',
        outputFormat,
      });
      expect(await server.calls[0].requestBodyJson).toMatchObject({
        generationConfig: { responseFormat: { audio: { mimeType } } },
      });
      expect(result.audio).toEqual(PCM_BYTES);
      expect(result.warnings).toEqual([]);
      expect(result.providerMetadata?.google.sampleRate).toBe(24000);
    },
  );

  it.each(['wav', 'audio/wav'])(
    'requests %s without adding another header',
    async outputFormat => {
      prepareResponse();
      const result = await modernModel.doGenerate({
        text: 'Hello',
        outputFormat,
      });
      expect(await server.calls[0].requestBodyJson).toMatchObject({
        generationConfig: {
          responseFormat: { audio: { mimeType: 'AUDIO_WAV' } },
        },
      });
      expect(result.audio).toEqual(convertBase64ToUint8Array(WAV_BASE64));
    },
  );

  it('returns empty audio without a WAV header', async () => {
    prepareResponse('audio/wav', '');
    expect((await modernModel.doGenerate({ text: 'Hello' })).audio).toEqual(
      new Uint8Array(),
    );
  });
});
