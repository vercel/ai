import {
  WORKFLOW_SERIALIZE,
  WORKFLOW_DESERIALIZE,
} from '@ai-sdk/provider-utils';
import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import { GladiaTranscriptionModel } from './gladia-transcription-model';
import { createGladia } from './gladia-provider';
import { readFile } from 'node:fs/promises';
import * as fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./version', () => ({
  VERSION: '0.0.0-test',
}));

const audioData = await readFile(path.join(__dirname, 'transcript-test.mp3'));
const provider = createGladia({ apiKey: 'test-api-key' });
const model = provider.transcription();

const uploadFixture = JSON.parse(
  fs.readFileSync('src/__fixtures__/gladia-upload.json', 'utf8'),
);
const initiateFixture = JSON.parse(
  fs.readFileSync('src/__fixtures__/gladia-initiate.json', 'utf8'),
);
const resultFixture = JSON.parse(
  fs.readFileSync('src/__fixtures__/gladia-result.json', 'utf8'),
);

const server = createTestServer({
  'https://api.gladia.io/v2/upload': {
    response: {
      type: 'json-value',
      body: uploadFixture,
    },
  },
  'https://api.gladia.io/v2/pre-recorded': {},
  [initiateFixture.result_url]: {},
  'https://cdn.evil.example/v2/pre-recorded/result': {},
});

function prepareJsonFixtureResponse(headers?: Record<string, string>) {
  server.urls['https://api.gladia.io/v2/pre-recorded'].response = {
    type: 'json-value',
    headers,
    body: initiateFixture,
  };
  server.urls[initiateFixture.result_url].response = {
    type: 'json-value',
    headers,
    body: resultFixture,
  };
}

describe('doGenerate', () => {
  describe('transcription', () => {
    beforeEach(() => prepareJsonFixtureResponse());

    it('should pass audio_url to pre-recorded endpoint', async () => {
      await model.doGenerate({
        audio: audioData,
        mediaType: 'audio/wav',
      });

      expect(await server.calls[1].requestBodyJson).toMatchObject({
        audio_url: uploadFixture.audio_url,
      });
    });

    it('should pass provider options to pre-recorded endpoint', async () => {
      await model.doGenerate({
        audio: audioData,
        mediaType: 'audio/wav',
        providerOptions: {
          gladia: {
            languageConfig: {
              languages: ['en'],
              codeSwitching: true,
            },
            piiRedaction: true,
            piiRedactionConfig: {
              entityTypes: ['EMAIL_ADDRESS', 'NAME'],
              processedTextType: 'MARKER',
            },
          },
        },
      });

      expect(await server.calls[1].requestBodyJson).toMatchObject({
        audio_url: uploadFixture.audio_url,
        language_config: {
          languages: ['en'],
          code_switching: true,
        },
        pii_redaction: true,
        pii_redaction_config: {
          entity_types: ['EMAIL_ADDRESS', 'NAME'],
          processed_text_type: 'MARKER',
        },
      });
    });

    it('should map deprecated language options to language_config', async () => {
      await model.doGenerate({
        audio: audioData,
        mediaType: 'audio/wav',
        providerOptions: {
          gladia: {
            language: 'en',
            enableCodeSwitching: true,
          },
        },
      });

      expect(await server.calls[1].requestBodyJson).toMatchObject({
        language_config: {
          languages: ['en'],
          code_switching: true,
        },
      });
    });

    it('should map deprecated customVocabulary arrays to custom_vocabulary_config', async () => {
      await model.doGenerate({
        audio: audioData,
        mediaType: 'audio/wav',
        providerOptions: {
          gladia: {
            customVocabulary: ['Gladia', 'AI SDK'],
          },
        },
      });

      expect(await server.calls[1].requestBodyJson).toMatchObject({
        custom_vocabulary: true,
        custom_vocabulary_config: {
          vocabulary: ['Gladia', 'AI SDK'],
        },
      });
    });

    it('should pass the model id to the pre-recorded endpoint', async () => {
      await provider.transcription('solaria-3').doGenerate({
        audio: audioData,
        mediaType: 'audio/wav',
        providerOptions: {
          gladia: {
            languageConfig: {
              languages: ['fr'],
            },
          },
        },
      });

      expect(await server.calls[1].requestBodyJson).toMatchObject({
        audio_url: uploadFixture.audio_url,
        model: 'solaria-3',
        language_config: {
          languages: ['fr'],
        },
      });
    });

    it('does not send a model when none is specified', async () => {
      await model.doGenerate({
        audio: audioData,
        mediaType: 'audio/wav',
      });

      const requestBody = await server.calls[1].requestBodyJson;
      expect(requestBody).not.toHaveProperty('model');
    });

    it('warns when solaria-3 is combined with multiple languages or code switching', async () => {
      const result = await provider.transcription('solaria-3').doGenerate({
        audio: audioData,
        mediaType: 'audio/wav',
        providerOptions: {
          gladia: {
            languageConfig: {
              languages: ['fr', 'en'],
              codeSwitching: true,
            },
          },
        },
      });

      expect(result.warnings).toEqual([
        expect.objectContaining({
          type: 'other',
          message: expect.stringContaining('single language'),
        }),
        expect.objectContaining({
          type: 'other',
          message: expect.stringContaining('code switching'),
        }),
      ]);
    });

    it('does not warn when solaria-3 is used with a single language', async () => {
      const result = await provider.transcription('solaria-3').doGenerate({
        audio: audioData,
        mediaType: 'audio/wav',
        providerOptions: {
          gladia: {
            languageConfig: {
              languages: ['fr'],
            },
          },
        },
      });

      expect(result.warnings).toEqual([]);
    });

    it('does not send the API key when the result URL is on a foreign origin', async () => {
      const foreignResultUrl =
        'https://cdn.evil.example/v2/pre-recorded/result';
      server.urls['https://api.gladia.io/v2/pre-recorded'].response = {
        type: 'json-value',
        body: { ...initiateFixture, result_url: foreignResultUrl },
      };
      server.urls[foreignResultUrl].response = {
        type: 'json-value',
        body: resultFixture,
      };

      await model.doGenerate({
        audio: audioData,
        mediaType: 'audio/wav',
      });

      const pollCall = server.calls.find(
        call => call.requestUrl === foreignResultUrl,
      );
      expect(pollCall).toBeDefined();
      expect(pollCall!.requestHeaders['x-gladia-key']).toBeUndefined();
    });

    it('should pass headers', async () => {
      const provider = createGladia({
        apiKey: 'test-api-key',
        headers: {
          'Custom-Provider-Header': 'provider-header-value',
        },
      });

      await provider.transcription().doGenerate({
        audio: audioData,
        mediaType: 'audio/wav',
        headers: {
          'Custom-Request-Header': 'request-header-value',
        },
      });

      expect(server.calls[1].requestHeaders).toMatchObject({
        'x-gladia-key': 'test-api-key',
        'x-gladia-version': 'ai-sdk/0.0.0-test',
        'content-type': 'application/json',
        'custom-provider-header': 'provider-header-value',
        'custom-request-header': 'request-header-value',
      });
      expect(server.calls[0].requestUserAgent).toContain(
        `ai-sdk-gladia/0.0.0-test`,
      );
    });

    it('should extract the transcription text', async () => {
      const result = await model.doGenerate({
        audio: audioData,
        mediaType: 'audio/wav',
      });

      expect(result.text).toBe(
        resultFixture.result.transcription.full_transcript,
      );
    });

    it('should preserve utterance metadata in provider metadata', async () => {
      const utterances = resultFixture.result.transcription.utterances.map(
        (utterance: Record<string, unknown>, index: number) => ({
          ...utterance,
          speaker: index === 0 ? 0 : `speaker-${index}`,
        }),
      );
      server.urls[initiateFixture.result_url].response = {
        type: 'json-value',
        body: {
          ...resultFixture,
          result: {
            ...resultFixture.result,
            transcription: {
              ...resultFixture.result.transcription,
              utterances,
            },
          },
        },
      };

      const result = await model.doGenerate({
        audio: audioData,
        mediaType: 'audio/wav',
      });

      const gladiaMetadata = result.providerMetadata?.gladia;
      expect(gladiaMetadata).toBeDefined();
      const metadataUtterances = (
        gladiaMetadata as {
          result: {
            transcription: {
              utterances: Record<string, unknown>[];
            };
          };
        }
      ).result.transcription.utterances;

      expect(metadataUtterances[0]).toMatchObject({
        speaker: 0,
        confidence: utterances[0].confidence,
        language: utterances[0].language,
        words: utterances[0].words,
      });
      expect(metadataUtterances[1]).toMatchObject({
        speaker: 'speaker-1',
      });
    });

    it('should generate full response', async () => {
      const testDate = new Date(0);
      const customModel = new GladiaTranscriptionModel('default', {
        provider: 'test-provider',
        url: ({ path }) => `https://api.gladia.io${path}`,
        headers: () => ({}),
        _internal: {
          currentDate: () => testDate,
        },
      });

      const result = await customModel.doGenerate({
        audio: audioData,
        mediaType: 'audio/wav',
      });

      expect(result).toMatchSnapshot({
        providerMetadata: expect.anything(),
      });
    });
  });

  describe('response headers', () => {
    beforeEach(() =>
      prepareJsonFixtureResponse({
        'x-request-id': 'test-request-id',
        'x-ratelimit-remaining': '123',
      }),
    );

    it('should include response headers', async () => {
      const testDate = new Date(0);
      const customModel = new GladiaTranscriptionModel('default', {
        provider: 'test-provider',
        url: ({ path }) => `https://api.gladia.io${path}`,
        headers: () => ({}),
        _internal: {
          currentDate: () => testDate,
        },
      });

      const result = await customModel.doGenerate({
        audio: audioData,
        mediaType: 'audio/wav',
      });

      expect(result.response).toMatchObject({
        timestamp: testDate,
        modelId: 'default',
        headers: {
          'content-type': 'application/json',
          'x-request-id': 'test-request-id',
          'x-ratelimit-remaining': '123',
        },
      });
    });
  });

  describe('response metadata', () => {
    beforeEach(() => prepareJsonFixtureResponse());

    it('should include timestamp and modelId', async () => {
      const testDate = new Date(0);
      const customModel = new GladiaTranscriptionModel('default', {
        provider: 'test-provider',
        url: ({ path }) => `https://api.gladia.io${path}`,
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
      expect(result.response.modelId).toBe('default');
    });
  });
});

describe('legacy option warnings', () => {
  beforeEach(() => prepareJsonFixtureResponse());
  it.each([
    ['contextPrompt', { contextPrompt: 'context' }],
    ['moderation', { moderation: true }],
    ['chapterization', { chapterization: true }],
    ['nameConsistency', { nameConsistency: true }],
    ['structuredDataExtraction', { structuredDataExtraction: true }],
    [
      'structuredDataExtractionConfig',
      { structuredDataExtractionConfig: { classes: ['test'] } },
    ],
    ['displayMode', { displayMode: false }],
    ['diarizationConfig.enhanced', { diarizationConfig: { enhanced: true } }],
  ] as const)('warns when %s is ignored', async (feature, options) => {
    const result = await model.doGenerate({
      audio: audioData,
      mediaType: 'audio/mp3',
      providerOptions: { gladia: options },
    });
    expect(result.warnings).toEqual([
      {
        type: 'unsupported',
        feature,
        details:
          'No longer supported by the Gladia v2 pre-recorded API; ignored.',
      },
    ]);
    const body = await server.calls[1].requestBodyJson;
    expect(body).toEqual(
      feature === 'diarizationConfig.enhanced'
        ? { audio_url: uploadFixture.audio_url, diarization_config: {} }
        : { audio_url: uploadFixture.audio_url },
    );
  });
  it.each([
    ['language', { language: 'en' }],
    ['detectLanguage', { detectLanguage: true }],
    ['enableCodeSwitching', { enableCodeSwitching: false }],
    ['codeSwitchingConfig', { codeSwitchingConfig: { languages: ['en'] } }],
  ] as const)(
    'warns when translating deprecated %s',
    async (setting, options) => {
      const result = await model.doGenerate({
        audio: audioData,
        mediaType: 'audio/mp3',
        providerOptions: { gladia: options },
      });
      expect(result.warnings).toContainEqual({
        type: 'deprecated',
        setting,
        message: 'Use languageConfig instead.',
      });
    },
  );
});

it('warns when explicit language configuration overrides legacy fields', async () => {
  prepareJsonFixtureResponse();
  const result = await model.doGenerate({
    audio: audioData,
    mediaType: 'audio/mp3',
    providerOptions: {
      gladia: { languageConfig: { codeSwitching: false }, language: 'en' },
    },
  });
  expect((await server.calls[1].requestBodyJson).language_config).toEqual({
    code_switching: false,
  });
  expect(result.warnings).toContainEqual({
    type: 'deprecated',
    setting: 'language',
    message:
      'Ignored because languageConfig is provided; remove this deprecated option.',
  });
});

describe('legacy vocabulary validation', () => {
  beforeEach(() => prepareJsonFixtureResponse());
  it('filters invalid legacy entries without crashing', async () => {
    const result = await model.doGenerate({
      audio: audioData,
      mediaType: 'audio/mp3',
      providerOptions: {
        gladia: {
          customVocabulary: [
            'Gladia',
            { value: 'AI SDK', intensity: 0.5 },
            null,
            42,
            {},
            { value: 3 },
            { value: 'Invalid intensity', intensity: 'high' },
            { value: 'Invalid pronunciations', pronunciations: [3] },
            { value: 'Invalid language', language: 42 },
          ],
        },
      },
    });
    expect(
      (await server.calls[1].requestBodyJson).custom_vocabulary_config
        .vocabulary,
    ).toEqual(['Gladia', { value: 'AI SDK', intensity: 0.5 }]);
    expect(result.warnings).toEqual([
      {
        type: 'deprecated',
        setting: 'customVocabulary',
        message:
          'Use customVocabulary: true with customVocabularyConfig instead of an array.',
      },
      {
        type: 'other',
        message:
          'Invalid customVocabulary entries were ignored; use strings or objects with a string value and correctly typed optional fields.',
      },
    ]);
  });
  it.each([[], [null, { value: 'Invalid', intensity: 'high' }]])(
    'omits vocabulary configuration when no valid legacy entries remain: %j',
    async customVocabulary => {
      await model.doGenerate({
        audio: audioData,
        mediaType: 'audio/mp3',
        providerOptions: { gladia: { customVocabulary } },
      });
      const body = await server.calls[1].requestBodyJson;
      expect(body).not.toHaveProperty('custom_vocabulary');
      expect(body).not.toHaveProperty('custom_vocabulary_config');
    },
  );
  it('warns when an explicit vocabulary overrides the legacy array', async () => {
    const result = await model.doGenerate({
      audio: audioData,
      mediaType: 'audio/mp3',
      providerOptions: {
        gladia: {
          customVocabulary: ['Legacy'],
          customVocabularyConfig: {
            vocabulary: ['Modern'],
            defaultIntensity: 0.4,
          },
        },
      },
    });
    expect(
      (await server.calls[1].requestBodyJson).custom_vocabulary_config,
    ).toEqual({ vocabulary: ['Modern'], default_intensity: 0.4 });
    expect(result.warnings).toContainEqual({
      type: 'other',
      message:
        'customVocabularyConfig.vocabulary overrides the deprecated customVocabulary array.',
    });
  });
});

describe('selected model identity', () => {
  beforeEach(() => prepareJsonFixtureResponse());
  it.each(['default', 'solaria-3'])(
    'retains %s through workflow serialization and response metadata',
    async modelId => {
      const original = provider.transcription(
        modelId,
      ) as GladiaTranscriptionModel;
      const snapshot = GladiaTranscriptionModel[WORKFLOW_SERIALIZE](original);
      const restored = GladiaTranscriptionModel[WORKFLOW_DESERIALIZE](snapshot);
      expect(restored.modelId).toBe(modelId);
      const result = await restored.doGenerate({
        audio: audioData,
        mediaType: 'audio/mp3',
        providerOptions: { gladia: { languageConfig: { languages: ['en'] } } },
      });
      expect(result.response.modelId).toBe(modelId);
      for (const call of server.calls) {
        expect(call.requestHeaders).toMatchObject({
          'x-gladia-key': 'test-api-key',
          'x-gladia-version': 'ai-sdk/0.0.0-test',
        });
      }
      const body = await server.calls[1].requestBodyJson;
      if (modelId === 'default') expect(body).not.toHaveProperty('model');
      else expect(body.model).toBe(modelId);
    },
  );
});

it('validates PII configuration before uploading audio', async () => {
  await expect(
    model.doGenerate({
      audio: audioData,
      mediaType: 'audio/mp3',
      providerOptions: {
        gladia: { piiRedactionConfig: { processedTextType: 'invalid' } },
      },
    }),
  ).rejects.toThrow('invalid gladia provider options');
  expect(server.calls).toHaveLength(0);
});

it('warns about missing solaria-3 language without changing the request', async () => {
  prepareJsonFixtureResponse();
  const result = await provider
    .transcription('solaria-3')
    .doGenerate({ audio: audioData, mediaType: 'audio/mp3' });
  expect(await server.calls[1].requestBodyJson).toEqual({
    audio_url: uploadFixture.audio_url,
    model: 'solaria-3',
  });
  expect(result.warnings).toEqual([
    {
      type: 'other',
      message:
        'The "solaria-3" model supports a single language only. Pass exactly one language in languageConfig.languages; Gladia may reject the request.',
    },
  ]);
});

it('warns when PII configuration is set without enabling redaction', async () => {
  prepareJsonFixtureResponse();
  const result = await model.doGenerate({
    audio: audioData,
    mediaType: 'audio/mp3',
    providerOptions: {
      gladia: { piiRedactionConfig: { processedTextType: 'MASK' } },
    },
  });
  expect(result.warnings).toEqual([
    {
      type: 'other',
      message: 'piiRedactionConfig has no effect unless piiRedaction is true.',
    },
  ]);
  expect((await server.calls[1].requestBodyJson).pii_redaction_config).toEqual({
    processed_text_type: 'MASK',
  });
});

it.each(['default', 'solaria-1', 'future-gladia-model'])(
  'forwards transcriptionModel alias ID %s',
  async modelId => {
    prepareJsonFixtureResponse();
    const selected = provider.transcriptionModel!(modelId);
    const result = await selected.doGenerate({
      audio: audioData,
      mediaType: 'audio/mp3',
    });
    expect(selected.modelId).toBe(modelId);
    expect(result.response.modelId).toBe(modelId);
    const body = await server.calls[1].requestBodyJson;
    if (modelId === 'default') expect(body).not.toHaveProperty('model');
    else expect(body.model).toBe(modelId);
  },
);

it('forwards current translation and audio-to-LLM options', async () => {
  prepareJsonFixtureResponse();
  await model.doGenerate({
    audio: audioData,
    mediaType: 'audio/mp3',
    providerOptions: {
      gladia: {
        translation: true,
        translationConfig: {
          targetLanguages: ['fr'],
          model: 'batch',
          lipsync: false,
          contextAdaptation: true,
          context: 'Science',
          informal: false,
        },
        audioToLlm: true,
        audioToLlmConfig: {
          prompts: ['Summarize'],
          model: 'openai/gpt-5.4-nano',
        },
      },
    },
  });
  expect(await server.calls[1].requestBodyJson).toMatchObject({
    translation_config: {
      target_languages: ['fr'],
      model: 'batch',
      lipsync: false,
      context_adaptation: true,
      context: 'Science',
      informal: false,
    },
    audio_to_llm_config: {
      prompts: ['Summarize'],
      model: 'openai/gpt-5.4-nano',
    },
  });
});
