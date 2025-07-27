import { createTestServer } from '@ai-sdk/provider-utils/test';
import { ElevenLabsTranscriptionModel } from './elevenlabs-transcription-model';
import { createElevenLabs } from './elevenlabs-provider';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const audioData = await readFile(path.join(__dirname, 'transcript-test.mp3'));
const provider = createElevenLabs({ apiKey: 'test-api-key' });
const model = provider.transcription('scribe_v1');

const server = createTestServer({
  'https://api.elevenlabs.io/v1/speech-to-text': {},
});

describe('doGenerate', () => {
  function prepareJsonResponse({
    headers,
  }: {
    headers?: Record<string, string>;
  } = {}) {
    server.urls['https://api.elevenlabs.io/v1/speech-to-text'].response = {
      type: 'json-value',
      headers,
      body: {
        language_code: 'en',
        language_probability: 0.98,
        text: 'Hello world!',
        words: [
          {
            text: 'Hello',
            type: 'word',
            start: 0,
            end: 0.5,
            speaker_id: 'speaker_1',
            characters: [
              {
                text: 'text',
                start: 0,
                end: 0.1,
              },
            ],
          },
          {
            text: ' ',
            type: 'spacing',
            start: 0.5,
            end: 0.5,
            speaker_id: 'speaker_1',
            characters: [
              {
                text: 'text',
                start: 0,
                end: 0.1,
              },
            ],
          },
          {
            text: 'world!',
            type: 'word',
            start: 0.5,
            end: 1.2,
            speaker_id: 'speaker_1',
            characters: [
              {
                text: 'text',
                start: 0,
                end: 0.1,
              },
            ],
          },
        ],
        additional_formats: [
          {
            requested_format: 'requested_format',
            file_extension: 'file_extension',
            content_type: 'content_type',
            is_base64_encoded: true,
            content: 'content',
          },
        ],
      },
    };
  }

  it('should pass the model', async () => {
    prepareJsonResponse();

    await model.doGenerate({
      audio: audioData,
      mediaType: 'audio/wav',
    });

    expect(await server.calls[0].requestBodyMultipart).toMatchObject({
      model_id: 'scribe_v1',
    });
  });

  it('should pass headers', async () => {
    prepareJsonResponse();

    const provider = createElevenLabs({
      apiKey: 'test-api-key',
      headers: {
        'Custom-Provider-Header': 'provider-header-value',
      },
    });

    await provider.transcription('scribe_v1').doGenerate({
      audio: audioData,
      mediaType: 'audio/wav',
      headers: {
        'Custom-Request-Header': 'request-header-value',
      },
    });

    expect(server.calls[0].requestHeaders).toMatchObject({
      'xi-api-key': 'test-api-key',
      'content-type': expect.stringMatching(
        /^multipart\/form-data; boundary=----formdata-undici-\d+$/,
      ),
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

    expect(result.text).toBe('Hello world!');
  });

  it('should include response data with timestamp, modelId and headers', async () => {
    prepareJsonResponse({
      headers: {
        'x-request-id': 'test-request-id',
        'x-ratelimit-remaining': '123',
      },
    });

    const testDate = new Date(0);
    const customModel = new ElevenLabsTranscriptionModel('scribe_v1', {
      provider: 'test-provider',
      url: () => 'https://api.elevenlabs.io/v1/speech-to-text',
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
      modelId: 'scribe_v1',
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
    const customModel = new ElevenLabsTranscriptionModel('scribe_v1', {
      provider: 'test-provider',
      url: () => 'https://api.elevenlabs.io/v1/speech-to-text',
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
    expect(result.response.modelId).toBe('scribe_v1');
  });

  it('should work when no additional formats are returned', async () => {
    server.urls['https://api.elevenlabs.io/v1/speech-to-text'].response = {
      type: 'json-value',
      body: {
        language_code: 'en',
        language_probability: 0.98,
        text: 'Hello world!',
        words: [
          {
            text: 'Hello',
            type: 'word',
            start: 0,
            end: 0.5,
            speaker_id: 'speaker_1',
            characters: [
              {
                text: 'text',
                start: 0,
                end: 0.1,
              },
            ],
          },
          {
            text: ' ',
            type: 'spacing',
            start: 0.5,
            end: 0.5,
            speaker_id: 'speaker_1',
            characters: [
              {
                text: 'text',
                start: 0,
                end: 0.1,
              },
            ],
          },
          {
            text: 'world!',
            type: 'word',
            start: 0.5,
            end: 1.2,
            speaker_id: 'speaker_1',
            characters: [
              {
                text: 'text',
                start: 0,
                end: 0.1,
              },
            ],
          },
        ],
      },
    };

    const testDate = new Date(0);
    const customModel = new ElevenLabsTranscriptionModel('scribe_v1', {
      provider: 'test-provider',
      url: () => 'https://api.elevenlabs.io/v1/speech-to-text',
      headers: () => ({}),
      _internal: {
        currentDate: () => testDate,
      },
    });

    const result = await customModel.doGenerate({
      audio: audioData,
      mediaType: 'audio/wav',
    });

    expect(result).toMatchInlineSnapshot(`
      {
        "durationInSeconds": 1.2,
        "language": "en",
        "response": {
          "body": {
            "language_code": "en",
            "language_probability": 0.98,
            "text": "Hello world!",
            "words": [
              {
                "characters": [
                  {
                    "end": 0.1,
                    "start": 0,
                    "text": "text",
                  },
                ],
                "end": 0.5,
                "speaker_id": "speaker_1",
                "start": 0,
                "text": "Hello",
                "type": "word",
              },
              {
                "characters": [
                  {
                    "end": 0.1,
                    "start": 0,
                    "text": "text",
                  },
                ],
                "end": 0.5,
                "speaker_id": "speaker_1",
                "start": 0.5,
                "text": " ",
                "type": "spacing",
              },
              {
                "characters": [
                  {
                    "end": 0.1,
                    "start": 0,
                    "text": "text",
                  },
                ],
                "end": 1.2,
                "speaker_id": "speaker_1",
                "start": 0.5,
                "text": "world!",
                "type": "word",
              },
            ],
          },
          "headers": {
            "content-length": "467",
            "content-type": "application/json",
          },
          "modelId": "scribe_v1",
          "timestamp": 1970-01-01T00:00:00.000Z,
        },
        "segments": [
          {
            "endSecond": 0.5,
            "startSecond": 0,
            "text": "Hello",
          },
          {
            "endSecond": 0.5,
            "startSecond": 0.5,
            "text": " ",
          },
          {
            "endSecond": 1.2,
            "startSecond": 0.5,
            "text": "world!",
          },
        ],
        "text": "Hello world!",
        "warnings": [],
      }
    `);
  });

  it('should pass provider options correctly', async () => {
    prepareJsonResponse();

    await model.doGenerate({
      audio: audioData,
      mediaType: 'audio/wav',
      providerOptions: {
        elevenlabs: {
          languageCode: 'en',
          fileFormat: 'pcm_s16le_16',
          tagAudioEvents: false,
          numSpeakers: 2,
          timestampsGranularity: 'character',
          diarize: true,
        },
      },
    });

    expect(await server.calls[0].requestBodyMultipart).toMatchInlineSnapshot(`
      {
        "diarize": "true",
        "file": File {
          Symbol(kHandle): Blob {},
          Symbol(kLength): 40169,
          Symbol(kType): "audio/wav",
        },
        "file_format": "pcm_s16le_16",
        "language_code": "en",
        "model_id": "scribe_v1",
        "num_speakers": "2",
        "tag_audio_events": "false",
        "timestamps_granularity": "character",
      }
    `);
  });
});
