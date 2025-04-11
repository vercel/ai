import { createTestServer } from '@ai-sdk/provider-utils/test';
import { GladiaTranscriptionModel } from './gladia-transcription-model';
import { createGladia } from './gladia-provider';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const audioData = await readFile(path.join(__dirname, 'transcript-test.mp3'));
const provider = createGladia({ apiKey: 'test-api-key' });
const model = provider.transcription();

const server = createTestServer({
  'https://api.gladia.io/v2/upload': {},
  'https://api.gladia.io/v2/pre-recorded': {},
  'https://api.gladia.io/v2/transcription/test-id': {},
});

describe('doGenerate', () => {
  function prepareJsonResponse({
    headers,
  }: {
    headers?: Record<string, string>;
  } = {}) {
    server.urls['https://api.gladia.io/v2/pre-recorded'].response = {
      type: 'json-value',
      headers,
      body: {
        id: 'test-id',
        result_url: 'https://api.gladia.io/v2/transcription/test-id',
      },
    };
    server.urls['https://api.gladia.io/v2/transcription/test-id'].response = {
      type: 'json-value',
      headers,
      body: {
        id: '45463597-20b7-4af7-b3b3-f5fb778203ab',
        request_id: 'G-45463597',
        version: 2,
        status: 'queued',
        created_at: '2023-12-28T09:04:17.210Z',
        completed_at: '2023-12-28T09:04:37.210Z',
        custom_metadata: {},
        error_code: 500,
        kind: 'pre-recorded',
        file: {
          id: '<string>',
          filename: '<string>',
          source: '<string>',
          audio_duration: 3600,
          number_of_channels: 1,
        },
        request_params: {
          context_prompt: '<string>',
          custom_vocabulary: false,
          custom_vocabulary_config: {
            vocabulary: {
              realtime_processing: {
                custom_vocabulary: true,
                custom_vocabulary_config: {
                  vocabulary: [
                    'Westeros',
                    {
                      value: 'Stark',
                    },
                    {
                      value: "Night's Watch",
                      pronunciations: ['Nightz Watch'],
                      intensity: 0.4,
                      language: 'en',
                    },
                  ],
                  default_intensity: 0.6,
                },
              },
            },
            default_intensity: 0.5,
          },
          detect_language: true,
          enable_code_switching: false,
          code_switching_config: {
            languages: [],
          },
          language: 'en',
          callback_url: 'http://callback.example',
          callback: false,
          callback_config: {
            url: 'http://callback.example',
            method: 'POST',
          },
          subtitles: false,
          subtitles_config: {
            formats: ['srt'],
            minimum_duration: 1,
            maximum_duration: 15.5,
            maximum_characters_per_row: 2,
            maximum_rows_per_caption: 3,
            style: 'default',
          },
          diarization: false,
          diarization_config: {
            number_of_speakers: 2,
            min_speakers: 1,
            max_speakers: 2,
            enhanced: false,
          },
          translation: false,
          translation_config: {
            target_languages: ['en'],
            model: 'base',
            match_original_utterances: true,
          },
          summarization: false,
          summarization_config: {
            type: 'general',
          },
          moderation: false,
          named_entity_recognition: false,
          chapterization: false,
          name_consistency: false,
          custom_spelling: false,
          custom_spelling_config: {
            spelling_dictionary: {
              Gettleman: ['gettleman'],
              SQL: ['Sequel'],
            },
          },
          structured_data_extraction: false,
          structured_data_extraction_config: {
            classes: ['Persons', 'Organizations'],
          },
          sentiment_analysis: false,
          audio_to_llm: false,
          audio_to_llm_config: {
            prompts: ['Extract the key points from the transcription'],
          },
          sentences: false,
          display_mode: false,
          punctuation_enhanced: false,
          audio_url: '<string>',
        },
        result: {
          metadata: {
            audio_duration: 3600,
            number_of_distinct_channels: 1,
            billing_time: 3600,
            transcription_time: 20,
          },
          transcription: {
            full_transcript: '<string>',
            languages: ['en'],
            sentences: [
              {
                success: true,
                is_empty: true,
                exec_time: 123,
                error: {
                  status_code: 500,
                  exception: '<string>',
                  message: '<string>',
                },
                results: ['<string>'],
              },
            ],
            subtitles: [
              {
                format: 'srt',
                subtitles: '<string>',
              },
            ],
            utterances: [
              {
                language: 'en',
                start: 123,
                end: 123,
                confidence: 123,
                channel: 1,
                speaker: 1,
                words: [
                  {
                    word: '<string>',
                    start: 123,
                    end: 123,
                    confidence: 123,
                  },
                ],
                text: '<string>',
              },
            ],
          },
          translation: {
            success: true,
            is_empty: true,
            exec_time: 123,
            error: {
              status_code: 500,
              exception: '<string>',
              message: '<string>',
            },
            results: [
              {
                error: {
                  status_code: 500,
                  exception: '<string>',
                  message: '<string>',
                },
                full_transcript: '<string>',
                languages: ['en'],
                sentences: [
                  {
                    success: true,
                    is_empty: true,
                    exec_time: 123,
                    error: {
                      status_code: 500,
                      exception: '<string>',
                      message: '<string>',
                    },
                    results: ['<string>'],
                  },
                ],
                subtitles: [
                  {
                    format: 'srt',
                    subtitles: '<string>',
                  },
                ],
                utterances: [
                  {
                    language: 'en',
                    start: 123,
                    end: 123,
                    confidence: 123,
                    channel: 1,
                    speaker: 1,
                    words: [
                      {
                        word: '<string>',
                        start: 123,
                        end: 123,
                        confidence: 123,
                      },
                    ],
                    text: '<string>',
                  },
                ],
              },
            ],
          },
          summarization: {
            success: true,
            is_empty: true,
            exec_time: 123,
            error: {
              status_code: 500,
              exception: '<string>',
              message: '<string>',
            },
            results: '<string>',
          },
          moderation: {
            success: true,
            is_empty: true,
            exec_time: 123,
            error: {
              status_code: 500,
              exception: '<string>',
              message: '<string>',
            },
            results: '<string>',
          },
          named_entity_recognition: {
            success: true,
            is_empty: true,
            exec_time: 123,
            error: {
              status_code: 500,
              exception: '<string>',
              message: '<string>',
            },
            entity: '<string>',
          },
          name_consistency: {
            success: true,
            is_empty: true,
            exec_time: 123,
            error: {
              status_code: 500,
              exception: '<string>',
              message: '<string>',
            },
            results: '<string>',
          },
          custom_spelling: {
            success: true,
            is_empty: true,
            exec_time: 123,
            error: {
              status_code: 500,
              exception: '<string>',
              message: '<string>',
            },
            results: '<string>',
          },
          speaker_reidentification: {
            success: true,
            is_empty: true,
            exec_time: 123,
            error: {
              status_code: 500,
              exception: '<string>',
              message: '<string>',
            },
            results: '<string>',
          },
          structured_data_extraction: {
            success: true,
            is_empty: true,
            exec_time: 123,
            error: {
              status_code: 500,
              exception: '<string>',
              message: '<string>',
            },
            results: '<string>',
          },
          sentiment_analysis: {
            success: true,
            is_empty: true,
            exec_time: 123,
            error: {
              status_code: 500,
              exception: '<string>',
              message: '<string>',
            },
            results: '<string>',
          },
          audio_to_llm: {
            success: true,
            is_empty: true,
            exec_time: 123,
            error: {
              status_code: 500,
              exception: '<string>',
              message: '<string>',
            },
            results: [
              {
                success: true,
                is_empty: true,
                exec_time: 123,
                error: {
                  status_code: 500,
                  exception: '<string>',
                  message: '<string>',
                },
                results: {
                  prompt: '<string>',
                  response: '<string>',
                },
              },
            ],
          },
          sentences: {
            success: true,
            is_empty: true,
            exec_time: 123,
            error: {
              status_code: 500,
              exception: '<string>',
              message: '<string>',
            },
            results: ['<string>'],
          },
          display_mode: {
            success: true,
            is_empty: true,
            exec_time: 123,
            error: {
              status_code: 500,
              exception: '<string>',
              message: '<string>',
            },
            results: ['<string>'],
          },
          chapters: {
            success: true,
            is_empty: true,
            exec_time: 123,
            error: {
              status_code: 500,
              exception: '<string>',
              message: '<string>',
            },
            results: {},
          },
        },
      },
    };
  }

  it('should pass the model', async () => {
    prepareJsonResponse();

    await model.doGenerate({
      audio: audioData,
      mediaType: 'audio/wav',
    });

    expect(await server.calls[1].requestBody).toMatchObject({
      audio_url: 'https://storage.gladia.io/mock-upload-url',
      speech_model: 'best',
    });
  });

  it('should pass headers', async () => {
    prepareJsonResponse();

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
      authorization: 'test-api-key',
      'content-type': 'application/json',
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

    expect(result.text).toBe('Smoke from hundreds of wildfires.');
  });

  it('should include response data with timestamp, modelId and headers', async () => {
    prepareJsonResponse({
      headers: {
        'x-request-id': 'test-request-id',
        'x-ratelimit-remaining': '123',
      },
    });

    const testDate = new Date(0);
    const customModel = new GladiaTranscriptionModel('best', {
      provider: 'test-provider',
      url: () => 'https://api.gladia.io/v2/transcript',
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
    const customModel = new GladiaTranscriptionModel('best', {
      provider: 'test-provider',
      url: () => 'https://api.gladia.io/v2/transcript',
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
