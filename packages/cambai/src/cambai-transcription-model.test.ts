import { describe, expect, it, vi } from 'vitest';
import { CambaiTranscriptionModel } from './cambai-transcription-model';

vi.mock('./version', () => ({
  VERSION: '0.0.0-test',
}));

const BASE_URL = 'https://client.camb.ai/apis';

const transcriptFixture = [
  { text: 'Hello from', start: 0.0, end: 0.5, speaker: 'speaker_0' },
  { text: 'the Camb AI SDK.', start: 0.5, end: 1.2, speaker: 'speaker_0' },
];

function createMockFetch(options?: {
  pollCount?: number;
  errorOnStatus?: boolean;
  errorOnResult?: boolean;
  missingRunId?: boolean;
}) {
  const pollCount = options?.pollCount ?? 0;
  let pollsSoFar = 0;

  return vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const urlStr = typeof url === 'string' ? url : url.toString();

    // Step 1: Create transcription (POST /transcribe)
    if (urlStr === `${BASE_URL}/transcribe` && init?.method !== 'GET') {
      return new Response(JSON.stringify({ task_id: 'test-task-123' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }

    // Step 2: Poll status (GET /transcribe/{task_id})
    if (urlStr.includes('/transcribe/test-task-123')) {
      if (options?.errorOnStatus) {
        return new Response(
          JSON.stringify({ status: 'ERROR', message: 'Processing failed' }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }

      if (pollsSoFar < pollCount) {
        pollsSoFar++;
        return new Response(JSON.stringify({ status: 'PENDING' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }

      return new Response(
        JSON.stringify({
          status: 'SUCCESS',
          run_id: options?.missingRunId ? undefined : 42,
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }

    // Step 3: Get result (GET /transcription-result/{run_id})
    if (urlStr.includes('/transcription-result/42')) {
      if (options?.errorOnResult) {
        return new Response('Internal Server Error', { status: 500 });
      }
      return new Response(JSON.stringify(transcriptFixture), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }

    return new Response('Not Found', { status: 404 });
  });
}

function createModel(mockFetch: ReturnType<typeof createMockFetch>) {
  return new CambaiTranscriptionModel('default', {
    provider: 'cambai.transcription',
    url: ({ path }) => `${BASE_URL}${path}`,
    headers: () => ({ 'x-api-key': 'test-key' }),
    fetch: mockFetch as any,
    _internal: {
      currentDate: () => new Date(0),
      pollIntervalMs: 0,
    },
  });
}

describe('CambaiTranscriptionModel', () => {
  describe('doGenerate', () => {
    it('should transcribe audio and return text', async () => {
      const mockFetch = createMockFetch();
      const model = createModel(mockFetch);

      const result = await model.doGenerate({
        audio: new Uint8Array([1, 2, 3, 4]),
        mediaType: 'audio/wav',
      });

      expect(result.text).toBe('Hello from the Camb AI SDK.');
    });

    it('should return segments with timing info', async () => {
      const mockFetch = createMockFetch();
      const model = createModel(mockFetch);

      const result = await model.doGenerate({
        audio: new Uint8Array([1, 2, 3, 4]),
        mediaType: 'audio/wav',
      });

      expect(result.segments).toEqual([
        { text: 'Hello from', startSecond: 0.0, endSecond: 0.5 },
        { text: 'the Camb AI SDK.', startSecond: 0.5, endSecond: 1.2 },
      ]);
    });

    it('should return durationInSeconds from last segment', async () => {
      const mockFetch = createMockFetch();
      const model = createModel(mockFetch);

      const result = await model.doGenerate({
        audio: new Uint8Array([1, 2, 3, 4]),
        mediaType: 'audio/wav',
      });

      expect(result.durationInSeconds).toBe(1.2);
    });

    it('should send language code in form data', async () => {
      const mockFetch = createMockFetch();
      const model = createModel(mockFetch);

      await model.doGenerate({
        audio: new Uint8Array([1, 2, 3, 4]),
        mediaType: 'audio/wav',
        providerOptions: {
          cambai: { language: 54 },
        },
      });

      // First call is POST /transcribe
      const firstCall = mockFetch.mock.calls[0];
      expect(firstCall[0]).toBe(`${BASE_URL}/transcribe`);
    });

    it('should pass word_level_timestamps in result query', async () => {
      const mockFetch = createMockFetch();
      const model = createModel(mockFetch);

      await model.doGenerate({
        audio: new Uint8Array([1, 2, 3, 4]),
        mediaType: 'audio/wav',
        providerOptions: {
          cambai: { wordLevelTimestamps: true },
        },
      });

      // Last call is GET /transcription-result/{run_id}?word_level_timestamps=true
      const lastCall = mockFetch.mock.calls[mockFetch.mock.calls.length - 1];
      expect(lastCall[0]).toContain('word_level_timestamps=true');
    });

    it('should poll when status is PENDING', async () => {
      const mockFetch = createMockFetch({ pollCount: 2 });
      const model = createModel(mockFetch);

      const result = await model.doGenerate({
        audio: new Uint8Array([1, 2, 3, 4]),
        mediaType: 'audio/wav',
      });

      expect(result.text).toBe('Hello from the Camb AI SDK.');
      // 1 create + 2 pending polls + 1 success poll + 1 result = 5 calls
      expect(mockFetch).toHaveBeenCalledTimes(5);
    });

    it('should throw on transcription error status', async () => {
      const mockFetch = createMockFetch({ errorOnStatus: true });
      const model = createModel(mockFetch);

      await expect(
        model.doGenerate({
          audio: new Uint8Array([1, 2, 3, 4]),
          mediaType: 'audio/wav',
        }),
      ).rejects.toThrow('Transcription failed: Processing failed');
    });

    it('should throw on result fetch failure', async () => {
      const mockFetch = createMockFetch({ errorOnResult: true });
      const model = createModel(mockFetch);

      await expect(
        model.doGenerate({
          audio: new Uint8Array([1, 2, 3, 4]),
          mediaType: 'audio/wav',
        }),
      ).rejects.toThrow('Transcription result fetch failed: 500');
    });

    it('should throw when run_id is missing from success response', async () => {
      const mockFetch = createMockFetch({ missingRunId: true });
      const model = createModel(mockFetch);

      await expect(
        model.doGenerate({
          audio: new Uint8Array([1, 2, 3, 4]),
          mediaType: 'audio/wav',
        }),
      ).rejects.toThrow('did not return a run_id');
    });

    it('should include response metadata', async () => {
      const mockFetch = createMockFetch();
      const model = createModel(mockFetch);

      const result = await model.doGenerate({
        audio: new Uint8Array([1, 2, 3, 4]),
        mediaType: 'audio/wav',
      });

      expect(result.response.timestamp).toEqual(new Date(0));
      expect(result.response.modelId).toBe('default');
    });

    it('should handle base64 string audio input', async () => {
      const mockFetch = createMockFetch();
      const model = createModel(mockFetch);

      // base64 for bytes [1, 2, 3, 4]
      const result = await model.doGenerate({
        audio: 'AQIDBA==',
        mediaType: 'audio/mp3',
      });

      expect(result.text).toBe('Hello from the Camb AI SDK.');
    });
  });
});
