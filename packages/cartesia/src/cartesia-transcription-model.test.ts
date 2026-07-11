import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import { CartesiaTranscriptionModel } from './cartesia-transcription-model';
import { createCartesia } from './cartesia-provider';
import { readFile } from 'node:fs/promises';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./version', () => ({
  VERSION: '0.0.0-test',
}));

const audioData = await readFile(path.join(__dirname, 'transcript-test.mp3'));
const provider = createCartesia({ apiKey: 'test-api-key' });
const model = provider.transcription('ink-whisper');

const server = createTestServer({
  'https://api.cartesia.ai/stt': {},
});

function prepareJsonFixtureResponse(
  filename: string,
  headers?: Record<string, string>,
) {
  server.urls['https://api.cartesia.ai/stt'].response = {
    type: 'json-value',
    headers,
    body: JSON.parse(
      fs.readFileSync(`src/__fixtures__/${filename}.json`, 'utf8'),
    ),
  };
}

describe('doGenerate', () => {
  describe('transcription', () => {
    beforeEach(() => prepareJsonFixtureResponse('cartesia-transcription'));

    it('should pass the model', async () => {
      await model.doGenerate({
        audio: audioData,
        mediaType: 'audio/wav',
      });

      expect(await server.calls[0].requestBodyMultipart).toMatchObject({
        model: 'ink-whisper',
      });
    });

    it('should pass headers', async () => {
      const provider = createCartesia({
        apiKey: 'test-api-key',
        headers: {
          'Custom-Provider-Header': 'provider-header-value',
        },
      });

      await provider.transcription('ink-whisper').doGenerate({
        audio: audioData,
        mediaType: 'audio/wav',
        headers: {
          'Custom-Request-Header': 'request-header-value',
        },
      });

      expect(server.calls[0].requestHeaders).toMatchObject({
        authorization: 'Bearer test-api-key',
        'cartesia-version': expect.any(String),
        'content-type': expect.stringMatching(
          /^multipart\/form-data; boundary=----formdata-undici-\d+$/,
        ),
        'custom-provider-header': 'provider-header-value',
        'custom-request-header': 'request-header-value',
      });
      expect(server.calls[0].requestUserAgent).toContain(
        `ai-sdk/cartesia/0.0.0-test`,
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

    it('should extract segments, language and duration', async () => {
      const result = await model.doGenerate({
        audio: audioData,
        mediaType: 'audio/wav',
      });

      expect(result.language).toBe('en');
      expect(result.durationInSeconds).toBe(2.479);
      expect(result.segments[0]).toStrictEqual({
        text: 'Hello',
        startSecond: 0.199,
        endSecond: 0.479,
      });
    });

    it('should pass language and timestamp granularities', async () => {
      await model.doGenerate({
        audio: audioData,
        mediaType: 'audio/wav',
        providerOptions: {
          cartesia: {
            language: 'en',
            timestampGranularities: ['word'],
          },
        },
      });

      const body = await server.calls[0].requestBodyMultipart;
      expect(body!.file).toBeInstanceOf(File);
      const { file: _, ...rest } = body!;
      expect(rest).toMatchObject({
        model: 'ink-whisper',
        language: 'en',
        'timestamp_granularities[]': 'word',
      });
    });
  });

  describe('response metadata', () => {
    it('should include response data with timestamp and modelId', async () => {
      prepareJsonFixtureResponse('cartesia-transcription');

      const testDate = new Date(0);
      const customModel = new CartesiaTranscriptionModel('ink-whisper', {
        provider: 'test-provider',
        url: () => 'https://api.cartesia.ai/stt',
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
      expect(result.response.modelId).toBe('ink-whisper');
    });
  });
});
