import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import { RevaiTranscriptionModel } from './revai-transcription-model';
import { createRevai } from './revai-provider';
import { readFile } from 'node:fs/promises';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./version', () => ({
  VERSION: '0.0.0-test',
}));

const audioData = await readFile(path.join(__dirname, 'transcript-test.mp3'));
const provider = createRevai({ apiKey: 'test-api-key' });
const model = provider.transcription('machine');

const server = createTestServer({
  'https://api.rev.ai/speechtotext/v1/jobs': {},
  'https://api.rev.ai/speechtotext/v1/jobs/test-id': {},
  'https://api.rev.ai/speechtotext/v1/jobs/test-id/transcript': {},
  'https://api.rev.ai/speechtotext/v1/jobs/abc%2F..%2F..%2Finternal': {},
  'https://api.rev.ai/speechtotext/v1/jobs/abc%2F..%2F..%2Finternal/transcript':
    {},
});

function prepareJsonFixtureResponse(headers?: Record<string, string>) {
  server.urls['https://api.rev.ai/speechtotext/v1/jobs'].response = {
    type: 'json-value',
    headers,
    body: JSON.parse(
      fs.readFileSync(`src/__fixtures__/revai-job-submit.json`, 'utf8'),
    ),
  };
  server.urls['https://api.rev.ai/speechtotext/v1/jobs/test-id'].response = {
    type: 'json-value',
    headers,
    body: JSON.parse(
      fs.readFileSync(`src/__fixtures__/revai-job-status.json`, 'utf8'),
    ),
  };
  server.urls[
    'https://api.rev.ai/speechtotext/v1/jobs/test-id/transcript'
  ].response = {
    type: 'json-value',
    headers,
    body: JSON.parse(
      fs.readFileSync(`src/__fixtures__/revai-transcript.json`, 'utf8'),
    ),
  };
}

describe('doGenerate', () => {
  describe('transcription', () => {
    beforeEach(() => prepareJsonFixtureResponse());

    it('should encode the job ID as a single URL path segment in the poll and transcript URLs', async () => {
      const jobId = 'abc/../../internal';
      const encodedJobId = encodeURIComponent(jobId);

      server.urls['https://api.rev.ai/speechtotext/v1/jobs'].response = {
        type: 'json-value',
        body: {
          id: jobId,
          created_on: '2026-02-12T23:26:22.276Z',
          name: 'audio.mp3',
          status: 'in_progress',
          type: 'async',
          language: 'en',
        },
      };
      server.urls[
        'https://api.rev.ai/speechtotext/v1/jobs/abc%2F..%2F..%2Finternal'
      ].response = {
        type: 'json-value',
        body: {
          id: jobId,
          created_on: '2026-02-12T23:26:22.276Z',
          completed_on: '2026-02-12T23:26:26.971Z',
          name: 'audio.mp3',
          status: 'transcribed',
          duration_seconds: 2.51,
          type: 'async',
          language: 'en',
        },
      };
      server.urls[
        'https://api.rev.ai/speechtotext/v1/jobs/abc%2F..%2F..%2Finternal/transcript'
      ].response = {
        type: 'json-value',
        body: JSON.parse(
          fs.readFileSync('src/__fixtures__/revai-transcript.json', 'utf8'),
        ),
      };

      await model.doGenerate({ audio: audioData, mediaType: 'audio/mp3' });

      expect(server.calls[1].requestUrl).toBe(
        `https://api.rev.ai/speechtotext/v1/jobs/${encodedJobId}`,
      );
      expect(server.calls[2].requestUrl).toBe(
        `https://api.rev.ai/speechtotext/v1/jobs/${encodedJobId}/transcript`,
      );
    });

    it('should pass the model', async () => {
      await model.doGenerate({
        audio: audioData,
        mediaType: 'audio/wav',
      });

      expect(await server.calls[0].requestBodyMultipart).toMatchObject({
        media: expect.any(File),
        config: '{"transcriber":"machine"}',
      });
    });

    it('should pass headers', async () => {
      const provider = createRevai({
        apiKey: 'test-api-key',
        headers: {
          'Custom-Provider-Header': 'provider-header-value',
        },
      });

      await provider.transcription('machine').doGenerate({
        audio: audioData,
        mediaType: 'audio/wav',
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
        `ai-sdk/revai/0.0.0-test`,
      );
    });

    it('should extract the transcription text', async () => {
      const result = await model.doGenerate({
        audio: audioData,
        mediaType: 'audio/wav',
      });

      expect(result.text).toMatchInlineSnapshot(
        `"Hello from the Sal, A-I-S-D-K."`,
      );
    });
  });

  describe('response headers', () => {
    it('should include response data with timestamp, modelId and headers', async () => {
      prepareJsonFixtureResponse({
        'x-request-id': 'test-request-id',
        'x-ratelimit-remaining': '123',
      });

      const testDate = new Date(0);
      const customModel = new RevaiTranscriptionModel('machine', {
        provider: 'test-provider',
        url: ({ path }) => `https://api.rev.ai${path}`,
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
      const customModel = new RevaiTranscriptionModel('machine', {
        provider: 'test-provider',
        url: ({ path }) => `https://api.rev.ai${path}`,
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
      expect(result.response.modelId).toBe('machine');
    });
  });
});
