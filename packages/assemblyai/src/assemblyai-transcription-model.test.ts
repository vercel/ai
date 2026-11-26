import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import {
  convertArrayToReadableStream,
  convertReadableStreamToArray,
} from '@ai-sdk/provider-utils/test';
import { UnsupportedFunctionalityError } from '@ai-sdk/provider';
import { AssemblyAITranscriptionModel } from './assemblyai-transcription-model';
import { createAssemblyAI } from './assemblyai-provider';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { beforeEach, describe, it, expect, vi } from 'vitest';

vi.mock('./version', () => ({
  VERSION: '0.0.0-test',
}));

const audioData = await readFile(path.join(__dirname, 'transcript-test.mp3'));
const provider = createAssemblyAI({ apiKey: 'test-api-key' });
const model = provider.transcription('assemblyai-stt-3-7');

const server = createTestServer({
  'https://api.assemblyai.com/v2/transcript': {},
  'https://api.assemblyai.com/v2/transcript/9ea68fd3-f953-42c1-9742-976c447fb463':
    {},
  'https://api.assemblyai.com/v2/upload': {
    response: {
      type: 'json-value',
      body: {
        id: '9ea68fd3-f953-42c1-9742-976c447fb463',
        upload_url: 'https://storage.assemblyai.com/mock-upload-url',
      },
    },
  },
});

describe('doGenerate', () => {
  function prepareJsonResponse({
    headers,
  }: {
    headers?: Record<string, string>;
  } = {}) {
    server.urls['https://api.assemblyai.com/v2/transcript'].response = {
      type: 'json-value',
      body: {
        id: '9ea68fd3-f953-42c1-9742-976c447fb463',
        status: 'queued',
      },
    };

    server.urls[
      'https://api.assemblyai.com/v2/transcript/9ea68fd3-f953-42c1-9742-976c447fb463'
    ].response = {
      type: 'json-value',
      headers,
      body: {
        id: '9ea68fd3-f953-42c1-9742-976c447fb463',
        audio_url: 'https://assembly.ai/test.mp3',
        status: 'completed',
        webhook_auth: true,
        auto_highlights: true,
        redact_pii: true,
        summarization: true,
        language_model: 'assemblyai_default',
        acoustic_model: 'assemblyai_default',
        language_code: 'en_us',
        language_detection: true,
        language_confidence_threshold: 0.7,
        language_confidence: 0.9959,
        speech_model: 'best',
        text: 'Hello, world!',
        words: [
          {
            confidence: 0.97465,
            start: 250,
            end: 650,
            text: 'Hello,',
            channel: 'channel',
            speaker: 'speaker',
          },
          {
            confidence: 0.99999,
            start: 730,
            end: 1022,
            text: 'world',
            channel: 'channel',
            speaker: 'speaker',
          },
        ],
        utterances: [
          {
            confidence: 0.9359033333333334,
            start: 250,
            end: 26950,
            text: 'Hello, world!',
            words: [
              {
                confidence: 0.97503,
                start: 250,
                end: 650,
                text: 'Hello,',
                speaker: 'A',
              },
              {
                confidence: 0.99999,
                start: 730,
                end: 1022,
                text: 'world',
                speaker: 'A',
              },
            ],
            speaker: 'A',
            channel: 'channel',
          },
        ],
        confidence: 0.9404651451800253,
        audio_duration: 281,
        punctuate: true,
        format_text: true,
        disfluencies: false,
        multichannel: false,
        audio_channels: 1,
        webhook_url: 'https://your-webhook-url.tld/path',
        webhook_status_code: 200,
        webhook_auth_header_name: 'webhook-secret',
        auto_highlights_result: {
          status: 'success',
          results: [
            {
              count: 1,
              rank: 0.08,
              text: 'Hello, world!',
              timestamps: [
                {
                  start: 250,
                  end: 26950,
                },
              ],
            },
          ],
        },
        audio_start_from: 10,
        audio_end_at: 280,
        word_boost: ['hello', 'world'],
        boost_param: 'high',
        filter_profanity: true,
        redact_pii_audio: true,
        redact_pii_audio_quality: 'mp3',
        redact_pii_policies: [
          'us_social_security_number',
          'credit_card_number',
        ],
        redact_pii_sub: 'hash',
        speaker_labels: true,
        speakers_expected: 2,
        content_safety: true,
        content_safety_labels: {
          status: 'success',
          results: [
            {
              text: 'Hello, world!',
              labels: [
                {
                  label: 'disasters',
                  confidence: 0.8142836093902588,
                  severity: 0.4093044400215149,
                },
              ],
              sentences_idx_start: 0,
              sentences_idx_end: 5,
              timestamp: {
                start: 250,
                end: 28840,
              },
            },
          ],
          summary: {
            disasters: 0.9940800441842205,
            health_issues: 0.9216489289040967,
          },
          severity_score_summary: {
            disasters: {
              low: 0.5733263024656846,
              medium: 0.42667369753431533,
              high: 0,
            },
            health_issues: {
              low: 0.22863814977924785,
              medium: 0.45014154926938227,
              high: 0.32122030095136983,
            },
          },
        },
        iab_categories: true,
        iab_categories_result: {
          status: 'success',
          results: [
            {
              text: 'Hello, world!',
              labels: [
                {
                  relevance: 0.988274097442627,
                  label: 'Home&Garden>IndoorEnvironmentalQuality',
                },
                {
                  relevance: 0.5821335911750793,
                  label: 'NewsAndPolitics>Weather',
                },
              ],
              timestamp: {
                start: 250,
                end: 28840,
              },
            },
          ],
          summary: {
            'NewsAndPolitics>Weather': 1,
            'Home&Garden>IndoorEnvironmentalQuality': 0.9043831825256348,
          },
        },
        auto_chapters: true,
        chapters: [
          {
            gist: 'Hello, world!',
            headline: 'Hello, world!',
            summary: 'Hello, world!',
            start: 250,
            end: 28840,
          },
          {
            gist: 'Hello, world!',
            headline: 'Hello, world!',
            summary: 'Hello, world!',
            start: 29610,
            end: 280340,
          },
        ],
        summary_type: 'bullets',
        summary_model: 'informative',
        summary: '- Hello, world!',
        sentiment_analysis: true,
        sentiment_analysis_results: [
          {
            text: 'Hello, world!',
            start: 250,
            end: 26950,
            sentiment: 'POSITIVE',
            confidence: 0.9,
            speaker: 'A',
          },
        ],
        entity_detection: true,
        entities: [
          {
            entity_type: 'location',
            text: 'Canada',
            start: 2548,
            end: 3130,
          },
          {
            entity_type: 'location',
            text: 'the US',
            start: 5498,
            end: 6382,
          },
        ],
        speech_threshold: 0.5,
        error: 'error',
        dual_channel: false,
        speed_boost: true,
      },
    };
  }

  it('should pass newer models via the speech_models parameter', async () => {
    prepareJsonResponse();

    const result = await provider
      .transcription('assemblyai-stt-3-7')
      .doGenerate({
        audio: audioData,
        mediaType: 'audio/wav',
      });

    const requestBody = await server.calls[1].requestBodyJson;
    expect(requestBody).toMatchObject({
      audio_url: 'https://storage.assemblyai.com/mock-upload-url',
      speech_models: ['assemblyai-stt-3-7'],
    });
    expect(requestBody.speech_model).toBeUndefined();

    // No deprecation and no nudge for the latest flagship model.
    expect(result.warnings).toEqual([]);
  });

  it('should route deprecated universal-3-5-pro via speech_models with a deprecation warning', async () => {
    prepareJsonResponse();

    const result = await provider
      .transcription('universal-3-5-pro')
      .doGenerate({
        audio: audioData,
        mediaType: 'audio/wav',
      });

    const requestBody = await server.calls[1].requestBodyJson;
    expect(requestBody.speech_models).toEqual(['universal-3-5-pro']);
    expect(requestBody.speech_model).toBeUndefined();

    expect(result.warnings).toEqual([
      {
        type: 'deprecated',
        setting: "model 'universal-3-5-pro'",
        message:
          "AssemblyAI has deprecated 'universal-3-5-pro'. Use 'assemblyai-stt-3-7' instead. See documentation: https://www.assemblyai.com/docs/pre-recorded-audio/select-the-speech-model",
      },
    ]);
  });

  it('should nudge universal-2 users toward assemblyai-stt-3-7 without deprecating it', async () => {
    prepareJsonResponse();

    const result = await provider.transcription('universal-2').doGenerate({
      audio: audioData,
      mediaType: 'audio/wav',
    });

    expect(result.warnings).toEqual([
      {
        type: 'other',
        message:
          "'assemblyai-stt-3-7' is AssemblyAI's latest flagship model; 'universal-2' remains available for languages it does not support. See https://www.assemblyai.com/docs/pre-recorded-audio/select-the-speech-model",
      },
    ]);
  });

  it.each(['best', 'slam-1', 'nano', 'universal-3-pro'])(
    'should not special-case the removed %s model',
    async modelId => {
      prepareJsonResponse();

      const result = await provider.transcription(modelId).doGenerate({
        audio: audioData,
        mediaType: 'audio/wav',
      });

      // Unlisted models fall through to `speech_models` unchanged and emit no
      // warning; the live API rejects the ones it no longer accepts.
      const requestBody = await server.calls[1].requestBodyJson;
      expect(requestBody.speech_models).toEqual([modelId]);
      expect(requestBody.speech_model).toBeUndefined();
      expect(result.warnings).toEqual([]);
    },
  );

  it('should still send provider options alongside speech_models', async () => {
    prepareJsonResponse();

    await provider.transcription('assemblyai-stt-3-7').doGenerate({
      audio: audioData,
      mediaType: 'audio/wav',
      providerOptions: {
        assemblyai: {
          languageDetection: true,
          punctuate: false,
        },
      },
    });

    const requestBody = await server.calls[1].requestBodyJson;
    expect(requestBody).toMatchObject({
      speech_models: ['assemblyai-stt-3-7'],
      language_detection: true,
      punctuate: false,
    });
  });

  it('should surface diarization + audio-intelligence via providerMetadata', async () => {
    prepareJsonResponse();

    const result = await provider
      .transcription('assemblyai-stt-3-7')
      .doGenerate({
        audio: audioData,
        mediaType: 'audio/wav',
      });

    const metadata = result.providerMetadata?.assemblyai as
      | Record<string, any>
      | undefined;
    expect(metadata).toBeDefined();

    // Speaker diarization
    expect(metadata?.utterances?.[0]).toMatchObject({
      speaker: 'A',
      text: 'Hello, world!',
    });

    // Audio-intelligence results
    expect(metadata?.entities?.[0]).toMatchObject({
      entity_type: 'location',
      text: 'Canada',
    });
    expect(metadata?.sentimentAnalysisResults?.[0]).toMatchObject({
      sentiment: 'POSITIVE',
      text: 'Hello, world!',
    });
    expect(metadata?.contentSafetyLabels).toBeDefined();
    expect(metadata?.iabCategoriesResult).toBeDefined();
    expect(metadata?.autoHighlightsResult).toBeDefined();
  });

  it('should preserve the full raw response on response.body', async () => {
    prepareJsonResponse();

    const result = await provider
      .transcription('assemblyai-stt-3-7')
      .doGenerate({
        audio: audioData,
        mediaType: 'audio/wav',
      });

    const body = result.response.body as Record<string, any>;
    // Word-level speaker label survives on the raw body.
    expect(body.words[0].speaker).toBe('speaker');
    // Fields not modeled in our schema (e.g. chapters, summary) are no longer
    // stripped — proves response.body is the raw response, not the parsed one.
    expect(body.chapters).toBeDefined();
    expect(body.summary).toBe('- Hello, world!');
  });

  it('should pass the prompted-model input params', async () => {
    prepareJsonResponse();

    await provider.transcription('assemblyai-stt-3-7').doGenerate({
      audio: audioData,
      mediaType: 'audio/wav',
      providerOptions: {
        assemblyai: {
          prompt: 'This is a conversation about the AI SDK.',
          keytermsPrompt: ['Vercel', 'AI SDK'],
          temperature: 0.2,
          removeAudioTags: 'speaker',
          domain: 'medical-v1',
        },
      },
    });

    const requestBody = await server.calls[1].requestBodyJson;
    expect(requestBody).toMatchObject({
      speech_models: ['assemblyai-stt-3-7'],
      prompt: 'This is a conversation about the AI SDK.',
      keyterms_prompt: ['Vercel', 'AI SDK'],
      temperature: 0.2,
      remove_audio_tags: 'speaker',
      domain: 'medical-v1',
    });
  });

  it('should pass the GA nested input params', async () => {
    prepareJsonResponse();

    await provider.transcription('assemblyai-stt-3-7').doGenerate({
      audio: audioData,
      mediaType: 'audio/wav',
      providerOptions: {
        assemblyai: {
          redactPii: true,
          speakerOptions: { minSpeakersExpected: 1, maxSpeakersExpected: 3 },
          languageDetectionOptions: {
            expectedLanguages: ['en', 'es'],
            fallbackLanguage: 'en',
            codeSwitching: true,
            codeSwitchingConfidenceThreshold: 0.5,
          },
          redactPiiAudioOptions: {
            returnRedactedNoSpeechAudio: true,
            overrideAudioRedactionMethod: 'silence',
          },
          redactPiiReturnUnredacted: true,
          redactStaticEntities: { INTERNAL_TOOL: ['Bearclaw'] },
        },
      },
    });

    const requestBody = await server.calls[1].requestBodyJson;
    expect(requestBody).toMatchObject({
      speaker_options: { min_speakers_expected: 1, max_speakers_expected: 3 },
      language_detection_options: {
        expected_languages: ['en', 'es'],
        fallback_language: 'en',
        code_switching: true,
        code_switching_confidence_threshold: 0.5,
      },
      redact_pii_audio_options: {
        return_redacted_no_speech_audio: true,
        override_audio_redaction_method: 'silence',
      },
      redact_pii_return_unredacted: true,
      redact_static_entities: { INTERNAL_TOOL: ['Bearclaw'] },
    });
  });

  it('should warn when deprecated wordBoost/boostParam options are used', async () => {
    prepareJsonResponse();

    const result = await provider
      .transcription('assemblyai-stt-3-7')
      .doGenerate({
        audio: audioData,
        mediaType: 'audio/wav',
        providerOptions: {
          assemblyai: { wordBoost: ['Vercel'], boostParam: 'high' },
        },
      });

    expect(result.warnings).toContainEqual({
      type: 'deprecated',
      setting: 'wordBoost, boostParam',
      message: expect.stringContaining('keytermsPrompt'),
    });
  });

  it('should attribute the deprecation warning to boostParam when only boostParam is set', async () => {
    prepareJsonResponse();

    const result = await provider
      .transcription('assemblyai-stt-3-7')
      .doGenerate({
        audio: audioData,
        mediaType: 'audio/wav',
        providerOptions: { assemblyai: { boostParam: 'high' } },
      });

    expect(result.warnings).toContainEqual({
      type: 'deprecated',
      setting: 'boostParam',
      message: expect.stringContaining('keytermsPrompt'),
    });
  });

  it('should warn when redactPii-dependent options are set without redactPii', async () => {
    prepareJsonResponse();

    const result = await provider
      .transcription('assemblyai-stt-3-7')
      .doGenerate({
        audio: audioData,
        mediaType: 'audio/wav',
        providerOptions: {
          assemblyai: { redactStaticEntities: { TOOL: ['Vercel'] } },
        },
      });

    expect(
      result.warnings.some(
        w => w.type === 'other' && w.message.includes('redactPii'),
      ),
    ).toBe(true);
  });

  it('should warn when redactPiiAudioOptions is set without redactPiiAudio', async () => {
    prepareJsonResponse();

    const result = await provider
      .transcription('assemblyai-stt-3-7')
      .doGenerate({
        audio: audioData,
        mediaType: 'audio/wav',
        providerOptions: {
          assemblyai: {
            redactPii: true,
            redactPiiAudioOptions: { overrideAudioRedactionMethod: 'silence' },
          },
        },
      });

    expect(
      result.warnings.some(
        w => w.type === 'other' && w.message.includes('redactPiiAudio'),
      ),
    ).toBe(true);
  });

  it('should warn when languageCode and languageDetection are combined', async () => {
    prepareJsonResponse();

    const result = await provider
      .transcription('assemblyai-stt-3-7')
      .doGenerate({
        audio: audioData,
        mediaType: 'audio/wav',
        providerOptions: {
          assemblyai: { languageCode: 'en', languageDetection: true },
        },
      });

    expect(
      result.warnings.some(
        w => w.type === 'other' && w.message.includes('languageDetection'),
      ),
    ).toBe(true);
  });

  it('should report segment timings in seconds (ms converted)', async () => {
    prepareJsonResponse();

    const result = await model.doGenerate({
      audio: audioData,
      mediaType: 'audio/wav',
    });

    // Fixture word[0] is start: 250ms, end: 650ms → 0.25s / 0.65s.
    expect(result.segments[0]).toEqual({
      text: 'Hello,',
      startSecond: 0.25,
      endSecond: 0.65,
    });
  });

  it('should upload base64 audio as binary data', async () => {
    prepareJsonResponse();

    let uploadBody: unknown;
    const provider = createAssemblyAI({
      apiKey: 'test-api-key',
      fetch: async (input, init) => {
        if (String(input).endsWith('/v2/upload')) {
          uploadBody = init?.body;
        }
        return fetch(input, init);
      },
    });

    await provider.transcription('assemblyai-stt-3-7').doGenerate({
      audio: audioData.toString('base64'),
      mediaType: 'audio/mpeg',
    });

    expect(uploadBody).toStrictEqual(new Uint8Array(audioData));
  });

  it('should pass headers', async () => {
    prepareJsonResponse();

    const provider = createAssemblyAI({
      apiKey: 'test-api-key',
      headers: {
        'Custom-Provider-Header': 'provider-header-value',
      },
    });

    await provider.transcription('assemblyai-stt-3-7').doGenerate({
      audio: audioData,
      mediaType: 'audio/wav',
      headers: {
        'Custom-Request-Header': 'request-header-value',
      },
    });

    expect(server.calls[0].requestHeaders).toMatchObject({
      authorization: 'test-api-key',
      'content-type': 'application/octet-stream',
      'custom-provider-header': 'provider-header-value',
      'custom-request-header': 'request-header-value',
    });
    expect(server.calls[0].requestUserAgent).toContain(
      `ai-sdk-assemblyai/0.0.0-test`,
    );
  });

  it('should extract the transcription text', async () => {
    prepareJsonResponse();

    const result = await model.doGenerate({
      audio: audioData,
      mediaType: 'audio/wav',
    });

    expect(result.text).toBe('Hello, world!');
  });

  it('should surface a flat error message from the submit call', async () => {
    prepareJsonResponse();

    server.urls['https://api.assemblyai.com/v2/transcript'].response = {
      type: 'error',
      status: 401,
      body: JSON.stringify({ error: 'Invalid API key' }),
    };

    await expect(
      model.doGenerate({
        audio: audioData,
        mediaType: 'audio/wav',
      }),
    ).rejects.toMatchObject({
      message: 'Invalid API key',
      statusCode: 401,
    });
  });

  it('should include response data with timestamp, modelId and headers', async () => {
    prepareJsonResponse({
      headers: {
        'x-request-id': 'test-request-id',
        'x-ratelimit-remaining': '123',
      },
    });

    const testDate = new Date(0);
    const customModel = new AssemblyAITranscriptionModel('assemblyai-stt-3-7', {
      provider: 'test-provider',
      url: ({ path }) => `https://api.assemblyai.com${path}`,
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
      modelId: 'assemblyai-stt-3-7',
      headers: {
        'content-type': 'application/json',
        'x-request-id': 'test-request-id',
        'x-ratelimit-remaining': '123',
      },
    });
  });

  it('should use real date when no custom date provider is specified', async () => {
    prepareJsonResponse();

    const testDate = new Date(0);
    const customModel = new AssemblyAITranscriptionModel('assemblyai-stt-3-7', {
      provider: 'test-provider',
      url: ({ path }) => `https://api.assemblyai.com${path}`,
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
    expect(result.response.modelId).toBe('assemblyai-stt-3-7');
  });
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

  remoteClose(code?: number, reason?: string) {
    this.readyState = 3;
    this.onclose?.({ code, reason });
  }

  error() {
    this.onerror?.({});
  }

  binaryFrames() {
    return this.send.mock.calls
      .map(([data]) => data)
      .filter((data): data is Uint8Array => data instanceof Uint8Array);
  }
}

const flush = () => new Promise(resolve => setTimeout(resolve, 0));

function createStreamingModel(modelId = 'assemblyai-stt-3-7-realtime') {
  return createAssemblyAI({
    apiKey: 'test-api-key',
    webSocket: MockWebSocket,
  }).transcription(modelId);
}

describe('doStream', () => {
  beforeEach(() => {
    MockWebSocket.instances = [];
  });

  it('streams turns and finishes with the session usage', async () => {
    const model = createStreamingModel();
    const result = await model.doStream!({
      audio: convertArrayToReadableStream([
        new Uint8Array(640).fill(1),
        // base64 for 640 bytes of 0x02
        Buffer.from(new Uint8Array(640).fill(2)).toString('base64'),
      ]),
      inputAudioFormat: { type: 'audio/pcm', rate: 16000 },
      headers: { 'Custom-Request-Header': 'request-value' },
      providerOptions: {
        assemblyai: {
          streaming: {
            keytermsPrompt: ['Vercel', 'AI SDK'],
            languageCodes: ['en', 'es'],
            languageDetection: true,
            maxTurnSilence: 1280,
            mode: 'balanced',
            speakerLabels: true,
          },
        },
      },
    });

    const partsPromise = convertReadableStreamToArray(result.stream);
    const ws = MockWebSocket.instances[0];
    const url = new URL(ws.url);
    expect(url.origin + url.pathname).toBe(
      'wss://streaming.assemblyai.com/v3/ws',
    );
    expect(Object.fromEntries(url.searchParams)).toStrictEqual({
      encoding: 'pcm_s16le',
      keyterms_prompt: '["Vercel","AI SDK"]',
      language_codes: '["en","es"]',
      language_detection: 'true',
      max_turn_silence: '1280',
      mode: 'balanced',
      sample_rate: '16000',
      speaker_labels: 'true',
      speech_model: 'assemblyai-stt-3-7-realtime',
    });
    expect(result.request?.body).toBe(url.toString());
    expect(ws.options?.headers).toMatchObject({
      authorization: 'test-api-key',
      'Custom-Request-Header': 'request-value',
    });

    ws.open();
    ws.message({ type: 'Begin', id: 'session-1', expires_at: 1 });
    await flush();
    ws.message({
      type: 'Turn',
      turn_order: 0,
      end_of_turn: false,
      transcript: 'Hello wor',
      words: [{ text: 'Hello', start: 160, end: 400, word_is_final: false }],
    });
    ws.message({
      type: 'Turn',
      turn_order: 0,
      end_of_turn: true,
      transcript: 'Hello world.',
      language_code: 'en',
      speaker_label: 'A',
      words: [
        { text: 'Hello', start: 160, end: 400, word_is_final: true },
        { text: 'world.', start: 420, end: 900, word_is_final: true },
      ],
    });
    ws.message({
      type: 'Termination',
      audio_duration_seconds: 2,
      session_duration_seconds: 3,
    });

    expect(await partsPromise).toStrictEqual([
      { type: 'stream-start', warnings: [] },
      { type: 'transcript-partial', id: 'session-1:0', text: 'Hello wor' },
      {
        type: 'transcript-final',
        id: 'session-1:0',
        text: 'Hello world.',
        startSecond: 0.16,
        endSecond: 0.9,
        providerMetadata: { assemblyai: { speakerLabel: 'A' } },
      },
      {
        type: 'finish',
        text: 'Hello world.',
        segments: [
          { text: 'Hello', startSecond: 0.16, endSecond: 0.4 },
          { text: 'world.', startSecond: 0.42, endSecond: 0.9 },
        ],
        language: 'en',
        durationInSeconds: 2,
        usage: { audio_duration_seconds: 2, session_duration_seconds: 3 },
      },
    ]);
    expect(ws.binaryFrames()).toStrictEqual([
      new Uint8Array(640).fill(1),
      new Uint8Array(640).fill(2),
    ]);
    expect(ws.send).toHaveBeenLastCalledWith(
      JSON.stringify({ type: 'Terminate' }),
    );
  });

  it('regroups audio into 20-1000 ms frames and pads the final frame with silence', async () => {
    const model = createStreamingModel();
    const result = await model.doStream!({
      // 16 kHz 16-bit PCM: 20 ms = 640 bytes, 1000 ms = 32000 bytes.
      audio: convertArrayToReadableStream([
        new Uint8Array(320).fill(1),
        new Uint8Array(320).fill(1),
        new Uint8Array(48000).fill(2),
        new Uint8Array(161).fill(3),
      ]),
      inputAudioFormat: { type: 'audio/pcm', rate: 16000 },
    });

    const partsPromise = convertReadableStreamToArray(result.stream);
    const ws = MockWebSocket.instances[0];
    ws.open();
    ws.message({ type: 'Begin', id: 'session-1' });
    await flush();
    ws.message({ type: 'Termination' });
    await partsPromise;

    const padded = new Uint8Array(640);
    padded.set(new Uint8Array(161).fill(3));
    expect(ws.binaryFrames()).toStrictEqual([
      new Uint8Array(640).fill(1),
      new Uint8Array(32000).fill(2),
      new Uint8Array(16000).fill(2),
      padded,
    ]);
  });

  it('defaults mu-law input to 8 kHz and pads with mu-law silence', async () => {
    const model = createStreamingModel();
    const result = await model.doStream!({
      audio: convertArrayToReadableStream([new Uint8Array(10).fill(7)]),
      inputAudioFormat: { type: 'audio/pcmu' },
    });

    const partsPromise = convertReadableStreamToArray(result.stream);
    const ws = MockWebSocket.instances[0];
    const url = new URL(ws.url);
    expect(url.searchParams.get('encoding')).toBe('pcm_mulaw');
    expect(url.searchParams.get('sample_rate')).toBe('8000');

    ws.open();
    ws.message({ type: 'Begin', id: 'session-1' });
    await flush();
    ws.message({ type: 'Termination' });
    await partsPromise;

    const padded = new Uint8Array(160).fill(0xff);
    padded.set(new Uint8Array(10).fill(7));
    expect(ws.binaryFrames()).toStrictEqual([padded]);
  });

  it('errors the stream with the AssemblyAI error message and code', async () => {
    const model = createStreamingModel();
    const result = await model.doStream!({
      audio: convertArrayToReadableStream([]),
      inputAudioFormat: { type: 'audio/pcm' },
    });

    const partsPromise = convertReadableStreamToArray(result.stream);
    const ws = MockWebSocket.instances[0];
    ws.open();
    ws.message({
      type: 'Error',
      error_code: 1008,
      error: 'Unauthorized Connection: Invalid API key',
    });

    await expect(partsPromise).rejects.toThrow(
      'AssemblyAI streaming transcription error (code 1008): Unauthorized Connection: Invalid API key',
    );
  });

  it('errors when the socket closes before the session terminates', async () => {
    const model = createStreamingModel();
    const result = await model.doStream!({
      audio: convertArrayToReadableStream([]),
      inputAudioFormat: { type: 'audio/pcm' },
    });

    const partsPromise = convertReadableStreamToArray(result.stream);
    const ws = MockWebSocket.instances[0];
    ws.open();
    ws.message({ type: 'Begin', id: 'session-1' });
    ws.remoteClose(3005, 'Session Cancelled');

    await expect(partsPromise).rejects.toThrow(
      'AssemblyAI streaming transcription closed before the session terminated (code 3005: Session Cancelled)',
    );
  });

  it('explains the native WebSocket header requirement on socket errors', async () => {
    vi.stubGlobal('WebSocket', MockWebSocket);
    try {
      const model = createAssemblyAI({ apiKey: 'test-api-key' }).transcription(
        'assemblyai-stt-3-7-realtime',
      );
      const result = await model.doStream!({
        audio: convertArrayToReadableStream([]),
        inputAudioFormat: { type: 'audio/pcm' },
      });
      const partsPromise = convertReadableStreamToArray(result.stream);
      MockWebSocket.instances[0].error();

      await expect(partsPromise).rejects.toThrow(
        'createAssemblyAI({ webSocket })',
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('warns about pre-recorded options and previous-generation models', async () => {
    const model = createStreamingModel('universal-3-6-pro');
    const result = await model.doStream!({
      audio: convertArrayToReadableStream([]),
      inputAudioFormat: { type: 'audio/pcm' },
      providerOptions: { assemblyai: { speakerLabels: true } },
    });

    const partsPromise = convertReadableStreamToArray(result.stream);
    const ws = MockWebSocket.instances[0];
    ws.open();
    ws.message({ type: 'Begin', id: 'session-1' });
    await flush();
    ws.message({ type: 'Termination' });

    expect((await partsPromise)[0]).toStrictEqual({
      type: 'stream-start',
      warnings: [
        {
          type: 'unsupported',
          feature: 'providerOptions.assemblyai.speakerLabels',
          details:
            'AssemblyAI streaming transcription does not support speakerLabels; use providerOptions.assemblyai.streaming.',
        },
        {
          type: 'other',
          message:
            "'universal-3-6-pro' is AssemblyAI's previous-generation streaming model; 'assemblyai-stt-3-7-realtime-agent' replaces it. See https://www.assemblyai.com/docs/streaming/select-the-speech-model",
        },
      ],
    });
  });

  it('rejects pre-recorded models, streaming models on doGenerate, and unsupported formats', async () => {
    await expect(
      createStreamingModel('assemblyai-stt-3-7').doStream!({
        audio: convertArrayToReadableStream([]),
        inputAudioFormat: { type: 'audio/pcm' },
      }),
    ).rejects.toThrow(UnsupportedFunctionalityError);

    await expect(
      createStreamingModel().doGenerate({
        audio: audioData,
        mediaType: 'audio/wav',
      }),
    ).rejects.toThrow(UnsupportedFunctionalityError);

    for (const inputAudioFormat of [
      { type: 'audio/pcma' },
      { type: 'audio/pcm', rate: 4000 },
    ]) {
      await expect(
        createStreamingModel().doStream!({
          audio: convertArrayToReadableStream([]),
          inputAudioFormat,
        }),
      ).rejects.toThrow('AssemblyAI streaming transcription supports');
    }
  });
});
