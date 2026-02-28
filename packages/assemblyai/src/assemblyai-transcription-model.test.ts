import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import { AssemblyAITranscriptionModel } from './assemblyai-transcription-model';
import { createAssemblyAI } from './assemblyai-provider';
import { readFile } from 'node:fs/promises';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./version', () => ({
  VERSION: '0.0.0-test',
}));

const audioData = await readFile(path.join(__dirname, 'transcript-test.mp3'));
const provider = createAssemblyAI({ apiKey: 'test-api-key' });
const model = provider.transcription('best');

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

function prepareJsonFixtureResponse(headers?: Record<string, string>) {
  server.urls['https://api.assemblyai.com/v2/transcript'].response = {
    type: 'json-value',
    body: JSON.parse(
      fs.readFileSync(
        'src/__fixtures__/assemblyai-transcript-submit.json',
        'utf8',
      ),
    ),
  };
  server.urls[
    'https://api.assemblyai.com/v2/transcript/9ea68fd3-f953-42c1-9742-976c447fb463'
  ].response = {
    type: 'json-value',
    headers,
    body: JSON.parse(
      fs.readFileSync(
        'src/__fixtures__/assemblyai-transcript-result.json',
        'utf8',
      ),
    ),
  };
}

describe('doGenerate', () => {
  describe('transcription', () => {
    beforeEach(() => prepareJsonFixtureResponse());

    it('should pass the model', async () => {
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
      expect(server.calls[0].requestUserAgent).toContain(
        `ai-sdk/assemblyai/0.0.0-test`,
      );
    });

    it('should extract the transcription text', async () => {
      const result = await model.doGenerate({
        audio: audioData,
        mediaType: 'audio/wav',
      });

      expect(result.text).toMatchInlineSnapshot(`"Hello, world!"`);
    });
  });

  describe('response headers', () => {
    it('should include response data with timestamp, modelId and headers', async () => {
      prepareJsonFixtureResponse({
        'x-request-id': 'test-request-id',
        'x-ratelimit-remaining': '123',
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

      expect(result.response).toMatchSnapshot();
    });
  });

  describe('response metadata', () => {
    it('should use real date when no custom date provider is specified', async () => {
      prepareJsonFixtureResponse();

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
});
