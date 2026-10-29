import { APICallError } from '@ai-sdk/provider';
import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import { ElevenLabsTranscriptionModel } from './elevenlabs-transcription-model';
import { createElevenLabs } from './elevenlabs-provider';
import { readFile } from 'node:fs/promises';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./version', () => ({
  VERSION: '0.0.0-test',
}));

const audioData = await readFile(path.join(__dirname, 'transcript-test.mp3'));
const provider = createElevenLabs({ apiKey: 'test-api-key' });
const model = provider.transcription('scribe_v1');

const server = createTestServer({
  'https://api.elevenlabs.io/v1/speech-to-text': {},
});

function prepareJsonFixtureResponse(
  filename: string,
  headers?: Record<string, string>,
) {
  server.urls['https://api.elevenlabs.io/v1/speech-to-text'].response = {
    type: 'json-value',
    headers,
    body: JSON.parse(
      fs.readFileSync(`src/__fixtures__/${filename}.json`, 'utf8'),
    ),
  };
}

describe('doGenerate', () => {
  describe('errors', () => {
    it('should surface the ElevenLabs error message and code', async () => {
      server.urls['https://api.elevenlabs.io/v1/speech-to-text'].response = {
        type: 'error',
        status: 404,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          detail: {
            type: 'not_found',
            code: 'model_not_found',
            message: "A model with model_id 'scribe_v1' was not found.",
            status: 'model_not_found',
            request_id: 'req_test_transcription',
          },
        }),
      };

      const result = model.doGenerate({
        audio: audioData,
        mediaType: 'audio/wav',
      });

      await expect(result).rejects.toBeInstanceOf(APICallError);
      await expect(result).rejects.toMatchObject({
        message:
          "A model with model_id 'scribe_v1' was not found. (model_not_found)",
        statusCode: 404,
        data: { detail: { request_id: 'req_test_transcription' } },
      });
    });
  });

  describe('transcription', () => {
    beforeEach(() => prepareJsonFixtureResponse('elevenlabs-transcription'));

    describe('duration', () => {
      const words = [{ text: 'Hello', type: 'word', start: 0, end: 2.06 }];

      it.each([
        ['includes trailing silence', 4.24, words, 4.24],
        ['does not require word timestamps', 4.24, null, 4.24],
        ['preserves a reported zero', 0, words, 0],
        ['falls back when audio duration is absent', undefined, words, 2.06],
        ['falls back when audio duration is null', null, words, 2.06],
      ])('%s', async (_name, audioDuration, words, expectedDuration) => {
        server.urls['https://api.elevenlabs.io/v1/speech-to-text'].response = {
          type: 'json-value',
          body: {
            audio_duration_secs: audioDuration,
            language_code: 'en',
            language_probability: 1,
            text: 'Hello',
            words,
          },
        };

        const result = await model.doGenerate({
          audio: audioData,
          mediaType: 'audio/wav',
        });

        expect(result.durationInSeconds).toBe(expectedDuration);
      });
    });

    it('should pass the model', async () => {
      await model.doGenerate({
        audio: audioData,
        mediaType: 'audio/wav',
      });

      expect(await server.calls[0].requestBodyMultipart).toMatchObject({
        model_id: 'scribe_v1',
      });
    });

    it('should pass headers', async () => {
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
      expect(server.calls[0].requestUserAgent).toContain(
        `ai-sdk/elevenlabs/0.0.0-test`,
      );
    });

    it('should extract the transcription text', async () => {
      const result = await model.doGenerate({
        audio: audioData,
        mediaType: 'audio/wav',
      });

      expect(result.text).toMatchInlineSnapshot(
        `"Hello from the Vercel AI SDK."`,
      );
    });

    it('preserves Scribe word and character timestamps in provider metadata', async () => {
      const words = [
        {
          text: 'Hi',
          type: 'word',
          start: 0,
          end: 0.4,
          speaker_id: 'speaker_0',
          characters: [
            { text: 'H', start: 0, end: 0.2 },
            { text: 'i', start: 0.2, end: 0.4 },
          ],
        },
      ];
      server.urls['https://api.elevenlabs.io/v1/speech-to-text'].response = {
        type: 'json-value',
        body: {
          language_code: 'eng',
          language_probability: 1,
          text: 'Hi',
          words,
        },
      };
      const result = await model.doGenerate({
        audio: audioData,
        mediaType: 'audio/wav',
        providerOptions: { elevenlabs: { timestampsGranularity: 'character' } },
      });
      expect(
        (await server.calls[0].requestBodyMultipart)?.timestamps_granularity,
      ).toBe('character');
      expect(result.segments).toStrictEqual([
        { text: 'Hi', startSecond: 0, endSecond: 0.4 },
      ]);
      expect(result.providerMetadata).toStrictEqual({ elevenlabs: { words } });
    });

    it('should pass provider options correctly', async () => {
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

      const multipart = await server.calls[0].requestBodyMultipart;
      expect(multipart).toEqual(
        expect.objectContaining({
          diarize: 'true',
          file_format: 'pcm_s16le_16',
          language_code: 'en',
          model_id: 'scribe_v1',
          num_speakers: '2',
          tag_audio_events: 'false',
          timestamps_granularity: 'character',
        }),
      );
      expect(multipart!.file).toBeInstanceOf(File);
      expect(multipart!.file.type).toBe('audio/wav');
      expect(multipart!.file.size).toBe(40169);
    });
  });

  describe('response headers', () => {
    it('should include response data with timestamp, modelId and headers', async () => {
      prepareJsonFixtureResponse('elevenlabs-transcription', {
        'x-request-id': 'test-request-id',
        'x-ratelimit-remaining': '123',
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

      expect(result.response).toMatchSnapshot();
    });
  });

  describe('response metadata', () => {
    it('should use real date when no custom date provider is specified', async () => {
      prepareJsonFixtureResponse('elevenlabs-transcription');

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
  });

  describe('no additional formats', () => {
    it('should work when no additional formats are returned', async () => {
      prepareJsonFixtureResponse('elevenlabs-transcription');

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

      expect(result).toMatchSnapshot({
        providerMetadata: { elevenlabs: { words: expect.any(Array) } },
      });
    });
  });
});
