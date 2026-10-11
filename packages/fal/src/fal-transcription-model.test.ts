import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import { createFal } from './fal-provider';
import { FalTranscriptionModel } from './fal-transcription-model';
import { readFile } from 'node:fs/promises';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect, beforeEach } from 'vitest';

const audioData = await readFile(path.join(__dirname, 'transcript-test.mp3'));
const provider = createFal({ apiKey: 'test-api-key' });
const model = provider.transcription('wizper');

const server = createTestServer({
  'https://queue.fal.run/fal-ai/wizper': {},
  'https://queue.fal.run/fal-ai/wizper/requests/test-id': {},
});

function prepareJsonFixtureResponse(headers?: Record<string, string>) {
  server.urls['https://queue.fal.run/fal-ai/wizper'].response = {
    type: 'json-value',
    headers,
    body: JSON.parse(
      fs.readFileSync('src/__fixtures__/fal-transcription-queue.json', 'utf8'),
    ),
  };
  server.urls['https://queue.fal.run/fal-ai/wizper/requests/test-id'].response =
    {
      type: 'json-value',
      headers,
      body: JSON.parse(
        fs.readFileSync(
          'src/__fixtures__/fal-transcription-result.json',
          'utf8',
        ),
      ),
    };
}

describe('doGenerate', () => {
  describe('transcription', () => {
    beforeEach(() => prepareJsonFixtureResponse());

    it('should not change chunk granularity for empty or unrelated provider options', async () => {
      const liveFixture = JSON.parse(
        fs.readFileSync(
          'src/__fixtures__/fal-transcription-chunk-level-live.json',
          'utf8',
        ),
      );
      const requestBodies: Array<{
        chunk_level: 'segment' | 'word';
        diarize: boolean;
      }> = [];
      const chunkLevelModel = createFal({
        apiKey: 'test-api-key',
        fetch: async (_url, init) => {
          if (init?.method === 'POST') {
            requestBodies.push(JSON.parse(String(init.body)));
            return Response.json({ request_id: 'job' });
          }

          const requestBody = requestBodies.at(-1)!;
          return Response.json(
            requestBody.chunk_level === 'word'
              ? liveFixture.word
              : requestBody.diarize
                ? liveFixture.segment
                : liveFixture.diarizeFalseSegment,
          );
        },
      }).transcription('whisper');

      const segmentCounts = [];
      for (const providerOptions of [
        undefined,
        { fal: {} },
        { fal: { diarize: false } },
        { fal: { chunkLevel: 'word' } },
        { fal: { chunkLevel: 'segment' } },
      ]) {
        const result = await chunkLevelModel.doGenerate({
          audio: audioData,
          mediaType: 'audio/wav',
          ...(providerOptions == null ? {} : { providerOptions }),
        });
        segmentCounts.push(result.segments.length);
      }

      expect(segmentCounts[3]).toBe(liveFixture.word.chunks.length);
      expect(segmentCounts[4]).toBe(liveFixture.segment.chunks.length);
      expect(segmentCounts[1]).toBe(segmentCounts[0]);
      expect(segmentCounts[2]).toBe(segmentCounts[0]);
    });

    it('should pass the model', async () => {
      await model.doGenerate({
        audio: audioData,
        mediaType: 'audio/wav',
      });

      expect(await server.calls[0].requestBodyJson).toMatchObject({
        audio_url: expect.stringMatching(/^data:audio\//),
        task: 'transcribe',
        diarize: true,
        chunk_level: 'word',
      });
    });

    it('should pass headers', async () => {
      const provider = createFal({
        apiKey: 'test-api-key',
        headers: {
          'Custom-Provider-Header': 'provider-header-value',
        },
      });

      await provider.transcription('wizper').doGenerate({
        audio: audioData,
        mediaType: 'audio/wav',
        headers: {
          'Custom-Request-Header': 'request-header-value',
        },
      });

      expect(server.calls[0].requestHeaders).toMatchObject({
        authorization: 'Key test-api-key',
        'content-type': 'application/json',
        'custom-provider-header': 'provider-header-value',
        'custom-request-header': 'request-header-value',
      });
    });

    it('should extract the transcription text', async () => {
      const result = await model.doGenerate({
        audio: audioData,
        mediaType: 'audio/wav',
      });

      expect(result.text).toMatchInlineSnapshot(
        `"Hello from the Versal AISDK."`,
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
      const customModel = new FalTranscriptionModel('wizper', {
        provider: 'test-provider',
        url: ({ path }) => path,
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
      const customModel = new FalTranscriptionModel('wizper', {
        provider: 'test-provider',
        url: ({ path }) => path,
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
      expect(result.response.modelId).toBe('wizper');
    });
  });
});
