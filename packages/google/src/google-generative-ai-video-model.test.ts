import { describe, expect, it, vi } from 'vitest';
import { GoogleGenerativeAIVideoModel } from './google-generative-ai-video-model';

vi.mock('./version', () => ({
  VERSION: '0.0.0-test',
}));

const prompt = 'A futuristic city with flying cars';

const defaultOptions = {
  prompt,
  n: 1,
  image: undefined,
  aspectRatio: undefined,
  resolution: undefined,
  duration: undefined,
  fps: undefined,
  seed: undefined,
  providerOptions: {
    google: {
      pollIntervalMs: 10, // Use short polling interval for tests
    },
  },
} as const;

function createMockModel({
  modelId = 'veo-3.1-generate-preview',
  currentDate,
  operationName = 'operations/test-operation-id',
  operationDone = true,
  operationError,
  videos = [
    {
      video: {
        uri: 'https://generativelanguage.googleapis.com/files/video-123.mp4',
      },
    },
  ],
  pollsUntilDone = 1,
  onRequest,
  apiKey = 'test-api-key',
}: {
  modelId?: string;
  currentDate?: () => Date;
  operationName?: string;
  operationDone?: boolean;
  operationError?: { code: number; message: string; status?: string };
  videos?: Array<{
    video?: {
      uri?: string;
    };
  }>;
  pollsUntilDone?: number;
  onRequest?: (
    url: string,
    body: unknown,
    headers: Record<string, string>,
  ) => void;
  apiKey?: string;
} = {}) {
  let pollCount = 0;

  return new GoogleGenerativeAIVideoModel(modelId, {
    provider: 'google.generative-ai',
    baseURL: 'https://generativelanguage.googleapis.com/v1beta',
    headers: () => ({ 'x-goog-api-key': apiKey }),
    fetch: async (url, init) => {
      const urlString = url.toString();
      const body = init?.body ? JSON.parse(init.body as string) : {};
      const headers = (init?.headers as Record<string, string>) ?? {};

      onRequest?.(urlString, body, headers);

      if (urlString.includes(':predictLongRunning')) {
        return new Response(
          JSON.stringify({
            name: operationName,
            done: false,
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          },
        );
      }

      if (urlString.includes(operationName)) {
        pollCount++;

        if (pollCount < pollsUntilDone) {
          return new Response(
            JSON.stringify({
              name: operationName,
              done: false,
            }),
            {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            },
          );
        }

        return new Response(
          JSON.stringify({
            name: operationName,
            done: operationDone,
            error: operationError,
            response: operationError
              ? undefined
              : {
                  generateVideoResponse: {
                    generatedSamples: videos,
                  },
                },
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          },
        );
      }

      return new Response('Not found', { status: 404 });
    },
    _internal: {
      currentDate,
    },
  });
}

describe('GoogleGenerativeAIVideoModel', () => {
  describe('constructor', () => {
    it('should expose correct provider and model information', () => {
      const model = createMockModel();

      expect(model.provider).toBe('google.generative-ai');
      expect(model.modelId).toBe('veo-3.1-generate-preview');
      expect(model.specificationVersion).toBe('v3');
      expect(model.maxVideosPerCall).toBe(4);
    });

    it('should support different model IDs', () => {
      const model = createMockModel({ modelId: 'veo-3.1-generate' });

      expect(model.modelId).toBe('veo-3.1-generate');
    });
  });

  describe('doGenerate', () => {
    it('should pass the correct parameters including prompt', async () => {
      let capturedBody: unknown;
      const model = createMockModel({
        onRequest: (url, body) => {
          if (url.includes(':predictLongRunning')) {
            capturedBody = body;
          }
        },
      });

      await model.doGenerate({ ...defaultOptions });

      expect(capturedBody).toStrictEqual({
        instances: [{ prompt }],
        parameters: { sampleCount: 1 },
      });
    });

    it('should pass seed when provided', async () => {
      let capturedBody: unknown;
      const model = createMockModel({
        onRequest: (url, body) => {
          if (url.includes(':predictLongRunning')) {
            capturedBody = body;
          }
        },
      });

      await model.doGenerate({
        ...defaultOptions,
        seed: 42,
      });

      expect(capturedBody).toStrictEqual({
        instances: [{ prompt }],
        parameters: { sampleCount: 1, seed: 42 },
      });
    });

    it('should pass aspect ratio when provided', async () => {
      let capturedBody: unknown;
      const model = createMockModel({
        onRequest: (url, body) => {
          if (url.includes(':predictLongRunning')) {
            capturedBody = body;
          }
        },
      });

      await model.doGenerate({
        ...defaultOptions,
        aspectRatio: '16:9',
      });

      expect(capturedBody).toStrictEqual({
        instances: [{ prompt }],
        parameters: { sampleCount: 1, aspectRatio: '16:9' },
      });
    });

    it('should convert resolution to Google format', async () => {
      let capturedBody: unknown;
      const model = createMockModel({
        onRequest: (url, body) => {
          if (url.includes(':predictLongRunning')) {
            capturedBody = body;
          }
        },
      });

      await model.doGenerate({
        ...defaultOptions,
        resolution: '1920x1080',
      });

      expect(capturedBody).toStrictEqual({
        instances: [{ prompt }],
        parameters: { sampleCount: 1, resolution: '1080p' },
      });
    });

    it('should pass duration as durationSeconds', async () => {
      let capturedBody: unknown;
      const model = createMockModel({
        onRequest: (url, body) => {
          if (url.includes(':predictLongRunning')) {
            capturedBody = body;
          }
        },
      });

      await model.doGenerate({
        ...defaultOptions,
        duration: 5,
      });

      expect(capturedBody).toStrictEqual({
        instances: [{ prompt }],
        parameters: { sampleCount: 1, durationSeconds: 5 },
      });
    });

    it('should pass n as sampleCount', async () => {
      let capturedBody: unknown;
      const model = createMockModel({
        videos: [
          { video: { uri: 'https://example.com/video1.mp4' } },
          { video: { uri: 'https://example.com/video2.mp4' } },
        ],
        onRequest: (url, body) => {
          if (url.includes(':predictLongRunning')) {
            capturedBody = body;
          }
        },
      });

      await model.doGenerate({
        ...defaultOptions,
        n: 2,
      });

      expect(capturedBody).toStrictEqual({
        instances: [{ prompt }],
        parameters: { sampleCount: 2 },
      });
    });

    it('should return video with correct data (URL with API key)', async () => {
      const model = createMockModel({
        apiKey: 'test-api-key',
        videos: [
          {
            video: {
              uri: 'https://generativelanguage.googleapis.com/files/video-123.mp4',
            },
          },
        ],
      });

      const result = await model.doGenerate({ ...defaultOptions });

      expect(result.videos).toHaveLength(1);
      expect(result.videos[0]).toStrictEqual({
        type: 'url',
        url: 'https://generativelanguage.googleapis.com/files/video-123.mp4?key=test-api-key',
        mediaType: 'video/mp4',
      });
    });

    it('should append API key with & when URL already has query params', async () => {
      const model = createMockModel({
        apiKey: 'test-api-key',
        videos: [
          {
            video: {
              uri: 'https://generativelanguage.googleapis.com/files/video-123.mp4?param=value',
            },
          },
        ],
      });

      const result = await model.doGenerate({ ...defaultOptions });

      expect(result.videos[0]).toStrictEqual({
        type: 'url',
        url: 'https://generativelanguage.googleapis.com/files/video-123.mp4?param=value&key=test-api-key',
        mediaType: 'video/mp4',
      });
    });

    it('should return multiple videos', async () => {
      const model = createMockModel({
        apiKey: 'test-key',
        videos: [
          { video: { uri: 'https://example.com/video1.mp4' } },
          { video: { uri: 'https://example.com/video2.mp4' } },
        ],
      });

      const result = await model.doGenerate({
        ...defaultOptions,
        n: 2,
      });

      expect(result.videos).toHaveLength(2);
      expect(result.videos[0]).toMatchObject({
        type: 'url',
        url: expect.stringContaining('video1.mp4'),
      });
      expect(result.videos[1]).toMatchObject({
        type: 'url',
        url: expect.stringContaining('video2.mp4'),
      });
    });

    it('should return warnings array', async () => {
      const model = createMockModel();

      const result = await model.doGenerate({ ...defaultOptions });

      expect(result.warnings).toStrictEqual([]);
    });
  });

  describe('response metadata', () => {
    it('should include timestamp and modelId in response', async () => {
      const testDate = new Date('2024-01-01T00:00:00Z');
      const model = createMockModel({
        currentDate: () => testDate,
      });

      const result = await model.doGenerate({ ...defaultOptions });

      expect(result.response.timestamp).toStrictEqual(testDate);
      expect(result.response.modelId).toBe('veo-3.1-generate-preview');
      expect(result.response.headers).toBeDefined();
    });
  });

  describe('providerMetadata', () => {
    it('should include video metadata', async () => {
      const model = createMockModel({
        videos: [
          {
            video: {
              uri: 'https://example.com/video.mp4',
            },
          },
        ],
      });

      const result = await model.doGenerate({ ...defaultOptions });

      expect(result.providerMetadata).toStrictEqual({
        google: {
          videos: [
            {
              uri: 'https://example.com/video.mp4',
            },
          ],
        },
      });
    });
  });

  describe('Image-to-Video', () => {
    it('should send image as inlineData', async () => {
      let capturedBody: unknown;
      const model = createMockModel({
        onRequest: (url, body) => {
          if (url.includes(':predictLongRunning')) {
            capturedBody = body;
          }
        },
      });

      await model.doGenerate({
        ...defaultOptions,
        image: {
          type: 'file',
          data: 'base64-image-data',
          mediaType: 'image/png',
        },
      });

      const body = capturedBody as { instances: Array<{ image: unknown }> };
      expect(body.instances[0].image).toStrictEqual({
        inlineData: {
          mimeType: 'image/png',
          data: 'base64-image-data',
        },
      });
    });

    it('should warn when URL-based image is provided', async () => {
      const model = createMockModel();

      const result = await model.doGenerate({
        ...defaultOptions,
        image: {
          type: 'url',
          url: 'https://example.com/image.png',
        },
      });

      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toMatchObject({
        type: 'unsupported',
        feature: 'URL-based image input',
      });
    });
  });

  describe('Provider Options', () => {
    it('should pass personGeneration option', async () => {
      let capturedBody: unknown;
      const model = createMockModel({
        onRequest: (url, body) => {
          if (url.includes(':predictLongRunning')) {
            capturedBody = body;
          }
        },
      });

      await model.doGenerate({
        ...defaultOptions,
        providerOptions: {
          google: {
            pollIntervalMs: 10,
            personGeneration: 'allow_adult',
          },
        },
      });

      expect(capturedBody).toStrictEqual({
        instances: [{ prompt }],
        parameters: {
          sampleCount: 1,
          personGeneration: 'allow_adult',
        },
      });
    });

    it('should pass negativePrompt option', async () => {
      let capturedBody: unknown;
      const model = createMockModel({
        onRequest: (url, body) => {
          if (url.includes(':predictLongRunning')) {
            capturedBody = body;
          }
        },
      });

      await model.doGenerate({
        ...defaultOptions,
        providerOptions: {
          google: {
            pollIntervalMs: 10,
            negativePrompt: 'blurry, low quality',
          },
        },
      });

      expect(capturedBody).toStrictEqual({
        instances: [{ prompt }],
        parameters: {
          sampleCount: 1,
          negativePrompt: 'blurry, low quality',
        },
      });
    });

    it('should pass referenceImages option', async () => {
      let capturedBody: unknown;
      const model = createMockModel({
        onRequest: (url, body) => {
          if (url.includes(':predictLongRunning')) {
            capturedBody = body;
          }
        },
      });

      await model.doGenerate({
        ...defaultOptions,
        providerOptions: {
          google: {
            pollIntervalMs: 10,
            referenceImages: [
              { bytesBase64Encoded: 'reference-image-data' },
              { gcsUri: 'gs://bucket/reference.png' },
            ],
          },
        },
      });

      const body = capturedBody as {
        instances: Array<{ referenceImages: unknown }>;
      };
      expect(body.instances[0].referenceImages).toStrictEqual([
        {
          inlineData: {
            mimeType: 'image/png',
            data: 'reference-image-data',
          },
        },
        {
          gcsUri: 'gs://bucket/reference.png',
        },
      ]);
    });
  });

  describe('Error Handling', () => {
    it('should throw error when no operation name is returned', async () => {
      const model = new GoogleGenerativeAIVideoModel(
        'veo-3.1-generate-preview',
        {
          provider: 'google.generative-ai',
          baseURL: 'https://generativelanguage.googleapis.com/v1beta',
          headers: () => ({ 'x-goog-api-key': 'test-key' }),
          fetch: async () => {
            return new Response(
              JSON.stringify({
                done: false,
              }),
              {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
              },
            );
          },
        },
      );

      await expect(
        model.doGenerate({ ...defaultOptions }),
      ).rejects.toMatchObject({
        message: 'No operation name returned from API',
      });
    });

    it('should throw error when operation fails', async () => {
      const model = createMockModel({
        operationError: {
          code: 400,
          message: 'Invalid request',
          status: 'INVALID_ARGUMENT',
        },
      });

      await expect(
        model.doGenerate({ ...defaultOptions }),
      ).rejects.toMatchObject({
        message: expect.stringContaining('Invalid request'),
      });
    });

    it('should throw error when no videos in response', async () => {
      const model = createMockModel({
        videos: [],
      });

      await expect(
        model.doGenerate({ ...defaultOptions }),
      ).rejects.toMatchObject({
        message: expect.stringContaining('No videos in response'),
      });
    });
  });

  describe('Polling Behavior', () => {
    it('should poll until operation is done', async () => {
      let pollCount = 0;
      const model = new GoogleGenerativeAIVideoModel(
        'veo-3.1-generate-preview',
        {
          provider: 'google.generative-ai',
          baseURL: 'https://generativelanguage.googleapis.com/v1beta',
          headers: () => ({ 'x-goog-api-key': 'test-key' }),
          fetch: async url => {
            const urlString = url.toString();

            if (urlString.includes(':predictLongRunning')) {
              return new Response(
                JSON.stringify({
                  name: 'operations/poll-test',
                  done: false,
                }),
                {
                  status: 200,
                  headers: { 'Content-Type': 'application/json' },
                },
              );
            }

            if (urlString.includes('operations/poll-test')) {
              pollCount++;

              if (pollCount < 3) {
                return new Response(
                  JSON.stringify({
                    name: 'operations/poll-test',
                    done: false,
                  }),
                  {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' },
                  },
                );
              }

              return new Response(
                JSON.stringify({
                  name: 'operations/poll-test',
                  done: true,
                  response: {
                    generateVideoResponse: {
                      generatedSamples: [
                        {
                          video: {
                            uri: 'https://example.com/final-video.mp4',
                          },
                        },
                      ],
                    },
                  },
                }),
                {
                  status: 200,
                  headers: { 'Content-Type': 'application/json' },
                },
              );
            }

            return new Response('Not found', { status: 404 });
          },
        },
      );

      const result = await model.doGenerate({ ...defaultOptions });

      expect(pollCount).toBe(3);
      expect(result.videos[0]).toMatchObject({
        type: 'url',
        url: expect.stringContaining('final-video.mp4'),
      });
    });

    it('should timeout after pollTimeoutMs', async () => {
      const model = new GoogleGenerativeAIVideoModel(
        'veo-3.1-generate-preview',
        {
          provider: 'google.generative-ai',
          baseURL: 'https://generativelanguage.googleapis.com/v1beta',
          headers: () => ({ 'x-goog-api-key': 'test-key' }),
          fetch: async url => {
            const urlString = url.toString();

            if (urlString.includes(':predictLongRunning')) {
              return new Response(
                JSON.stringify({
                  name: 'operations/timeout-test',
                  done: false,
                }),
                {
                  status: 200,
                  headers: { 'Content-Type': 'application/json' },
                },
              );
            }

            if (urlString.includes('operations/timeout-test')) {
              return new Response(
                JSON.stringify({
                  name: 'operations/timeout-test',
                  done: false,
                }),
                {
                  status: 200,
                  headers: { 'Content-Type': 'application/json' },
                },
              );
            }

            return new Response('Not found', { status: 404 });
          },
        },
      );

      await expect(
        model.doGenerate({
          ...defaultOptions,
          providerOptions: {
            google: {
              pollIntervalMs: 10,
              pollTimeoutMs: 50,
            },
          },
        }),
      ).rejects.toMatchObject({
        message: expect.stringContaining('timed out'),
      });
    });

    it('should respect abort signal', async () => {
      const abortController = new AbortController();

      const model = new GoogleGenerativeAIVideoModel(
        'veo-3.1-generate-preview',
        {
          provider: 'google.generative-ai',
          baseURL: 'https://generativelanguage.googleapis.com/v1beta',
          headers: () => ({ 'x-goog-api-key': 'test-key' }),
          fetch: async url => {
            const urlString = url.toString();

            if (urlString.includes(':predictLongRunning')) {
              return new Response(
                JSON.stringify({
                  name: 'operations/abort-test',
                  done: false,
                }),
                {
                  status: 200,
                  headers: { 'Content-Type': 'application/json' },
                },
              );
            }

            if (urlString.includes('operations/abort-test')) {
              abortController.abort();
              return new Response(
                JSON.stringify({
                  name: 'operations/abort-test',
                  done: false,
                }),
                {
                  status: 200,
                  headers: { 'Content-Type': 'application/json' },
                },
              );
            }

            return new Response('Not found', { status: 404 });
          },
        },
      );

      await expect(
        model.doGenerate({
          ...defaultOptions,
          providerOptions: {
            google: {
              pollIntervalMs: 10,
            },
          },
          abortSignal: abortController.signal,
        }),
      ).rejects.toMatchObject({
        message: expect.stringContaining('aborted'),
      });
    });
  });

  describe('Media Type', () => {
    it('should always return video/mp4 as media type', async () => {
      const model = createMockModel({
        videos: [
          {
            video: {
              uri: 'https://example.com/video.mp4',
            },
          },
        ],
      });

      const result = await model.doGenerate({ ...defaultOptions });

      expect(result.videos[0].mediaType).toBe('video/mp4');
    });
  });

  describe('doStart', () => {
    it('should return operation with operationName', async () => {
      const model = createMockModel({
        operationName: 'operations/start-test-op',
      });

      const result = await model.doStart({ ...defaultOptions });

      expect(result.operation).toStrictEqual({
        operationName: 'operations/start-test-op',
      });
    });

    it('should pass correct request body', async () => {
      let capturedBody: unknown;
      const model = createMockModel({
        onRequest: (url, body) => {
          if (url.includes(':predictLongRunning')) {
            capturedBody = body;
          }
        },
      });

      await model.doStart({ ...defaultOptions });

      expect(capturedBody).toStrictEqual({
        instances: [{ prompt }],
        parameters: { sampleCount: 1 },
      });
    });

    it('should pass headers', async () => {
      let capturedHeaders: Record<string, string> = {};
      const model = createMockModel({
        onRequest: (url, _body, headers) => {
          if (url.includes(':predictLongRunning')) {
            capturedHeaders = headers;
          }
        },
      });

      await model.doStart({
        ...defaultOptions,
        headers: { 'x-custom-header': 'custom-value' },
      });

      expect(capturedHeaders['x-custom-header']).toBe('custom-value');
      expect(capturedHeaders['x-goog-api-key']).toBe('test-api-key');
    });

    it('should throw when no operation name returned', async () => {
      const model = new GoogleGenerativeAIVideoModel(
        'veo-3.1-generate-preview',
        {
          provider: 'google.generative-ai',
          baseURL: 'https://generativelanguage.googleapis.com/v1beta',
          headers: () => ({ 'x-goog-api-key': 'test-key' }),
          fetch: async () => {
            return new Response(
              JSON.stringify({
                done: false,
              }),
              {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
              },
            );
          },
        },
      );

      await expect(model.doStart({ ...defaultOptions })).rejects.toMatchObject({
        message: 'No operation name returned from API',
      });
    });

    it('should include warnings and response metadata', async () => {
      const testDate = new Date('2024-01-01T00:00:00Z');
      const model = createMockModel({
        currentDate: () => testDate,
      });

      const result = await model.doStart({ ...defaultOptions });

      expect(result.warnings).toStrictEqual([]);
      expect(result.response.timestamp).toStrictEqual(testDate);
      expect(result.response.modelId).toBe('veo-3.1-generate-preview');
      expect(result.response.headers).toBeDefined();
    });
  });

  describe('doStatus', () => {
    it('should return completed with video data when done', async () => {
      const model = createMockModel({
        operationName: 'operations/status-test-op',
        videos: [
          {
            video: {
              uri: 'https://generativelanguage.googleapis.com/files/video-456.mp4',
            },
          },
        ],
      });

      const result = await model.doStatus({
        operation: { operationName: 'operations/status-test-op' },
      });

      expect(result.status).toBe('completed');
      if (result.status === 'completed') {
        expect(result.videos).toHaveLength(1);
        expect(result.videos[0]).toStrictEqual({
          type: 'url',
          url: 'https://generativelanguage.googleapis.com/files/video-456.mp4?key=test-api-key',
          mediaType: 'video/mp4',
        });
      }
    });

    it('should return pending when not done', async () => {
      const testDate = new Date('2024-06-15T00:00:00Z');
      const model = new GoogleGenerativeAIVideoModel(
        'veo-3.1-generate-preview',
        {
          provider: 'google.generative-ai',
          baseURL: 'https://generativelanguage.googleapis.com/v1beta',
          headers: () => ({ 'x-goog-api-key': 'test-key' }),
          fetch: async () => {
            return new Response(
              JSON.stringify({
                name: 'operations/pending-op',
                done: false,
              }),
              {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
              },
            );
          },
          _internal: {
            currentDate: () => testDate,
          },
        },
      );

      const result = await model.doStatus({
        operation: { operationName: 'operations/pending-op' },
      });

      expect(result.status).toBe('pending');
      expect(result.response.timestamp).toStrictEqual(testDate);
      expect(result.response.modelId).toBe('veo-3.1-generate-preview');
    });

    it('should throw on operation error', async () => {
      const model = new GoogleGenerativeAIVideoModel(
        'veo-3.1-generate-preview',
        {
          provider: 'google.generative-ai',
          baseURL: 'https://generativelanguage.googleapis.com/v1beta',
          headers: () => ({ 'x-goog-api-key': 'test-key' }),
          fetch: async () => {
            return new Response(
              JSON.stringify({
                name: 'operations/error-op',
                done: true,
                error: {
                  code: 400,
                  message: 'Content policy violation',
                  status: 'FAILED_PRECONDITION',
                },
              }),
              {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
              },
            );
          },
        },
      );

      await expect(
        model.doStatus({
          operation: { operationName: 'operations/error-op' },
        }),
      ).rejects.toMatchObject({
        message: expect.stringContaining('Content policy violation'),
      });
    });

    it('should throw when no videos in response', async () => {
      const model = new GoogleGenerativeAIVideoModel(
        'veo-3.1-generate-preview',
        {
          provider: 'google.generative-ai',
          baseURL: 'https://generativelanguage.googleapis.com/v1beta',
          headers: () => ({ 'x-goog-api-key': 'test-key' }),
          fetch: async () => {
            return new Response(
              JSON.stringify({
                name: 'operations/empty-op',
                done: true,
                response: {
                  generateVideoResponse: {
                    generatedSamples: [],
                  },
                },
              }),
              {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
              },
            );
          },
        },
      );

      await expect(
        model.doStatus({
          operation: { operationName: 'operations/empty-op' },
        }),
      ).rejects.toMatchObject({
        message: expect.stringContaining('No videos in response'),
      });
    });

    it('should pass headers to status request', async () => {
      let capturedHeaders: Record<string, string> = {};
      const model = new GoogleGenerativeAIVideoModel(
        'veo-3.1-generate-preview',
        {
          provider: 'google.generative-ai',
          baseURL: 'https://generativelanguage.googleapis.com/v1beta',
          headers: () => ({ 'x-goog-api-key': 'test-key' }),
          fetch: async (_url, init) => {
            capturedHeaders = (init?.headers as Record<string, string>) ?? {};
            return new Response(
              JSON.stringify({
                name: 'operations/headers-test',
                done: false,
              }),
              {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
              },
            );
          },
        },
      );

      await model.doStatus({
        operation: { operationName: 'operations/headers-test' },
        headers: { 'x-custom': 'value' },
      });

      expect(capturedHeaders['x-custom']).toBe('value');
      expect(capturedHeaders['x-goog-api-key']).toBe('test-key');
    });
  });
});
