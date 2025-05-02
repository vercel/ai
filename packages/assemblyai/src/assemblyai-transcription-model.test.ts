import { createTestServer } from '@ai-sdk/provider-utils/test';
import { AssemblyAITranscriptionModel } from './assemblyai-transcription-model';
import { createAssemblyAI } from './assemblyai-provider';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const audioData = await readFile(path.join(__dirname, 'transcript-test.mp3'));
const provider = createAssemblyAI({ apiKey: 'test-api-key' });
const model = provider.transcription('best');

const server = createTestServer({
  'https://api.assemblyai.com/v2/transcript': {},
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
        topics: ['topics'],
        sentiment_analysis: true,
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
        custom_topics: true,
      },
    };
  }

  it('should pass the model', async () => {
    prepareJsonResponse();

    await model.doGenerate({
      audio: audioData,
      mediaType: 'audio/wav',
    });

    expect(await server.calls[1].requestBodyJson).toMatchObject({
      audio_url: 'https://storage.assemblyai.com/mock-upload-url',
      speech_model: 'best',
    });
  });

  it('should pass headers', async () => {
    prepareJsonResponse();

    const provider = createAssemblyAI({
      apiKey: 'test-api-key',
      headers: {
        'Custom-Provider-Header': 'provider-header-value',
      },
    });

    await provider.transcription('best').doGenerate({
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
  });

  it('should extract the transcription text', async () => {
    prepareJsonResponse();

    const result = await model.doGenerate({
      audio: audioData,
      mediaType: 'audio/wav',
    });

    expect(result.text).toBe('Hello, world!');
  });

  it('should include response data with timestamp, modelId and headers', async () => {
    prepareJsonResponse({
      headers: {
        'x-request-id': 'test-request-id',
        'x-ratelimit-remaining': '123',
      },
    });

    const testDate = new Date(0);
    const customModel = new AssemblyAITranscriptionModel('best', {
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
      modelId: 'best',
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
    const customModel = new AssemblyAITranscriptionModel('best', {
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
    expect(result.response.modelId).toBe('best');
  });
});
