import { describe, expect, it, vi } from 'vitest';
import { GoogleVertexVideoModel } from './google-vertex-video-model';

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
  providerOptions: {},
} as const;

function createMockModel({
  modelId = 'veo-2.0-generate-001',
  currentDate,
  operationName = 'operations/test-operation-id',
  operationDone = true,
  operationError,
  videos = [
    {
      video: {
        bytesBase64Encoded: 'base64-video-data',
        mimeType: 'video/mp4',
      },
    },
  ],
  pollsUntilDone = 1,
  onRequest,
}: {
  modelId?: string;
  currentDate?: () => Date;
  operationName?: string;
  operationDone?: boolean;
  operationError?: { code: number; message: string; status?: string };
  videos?: Array<{
    video?: {
      bytesBase64Encoded?: string;
      gcsUri?: string;
      mimeType?: string;
    };
  }>;
  pollsUntilDone?: number;
  onRequest?: (
    url: string,
    body: unknown,
    headers: Record<string, string>,
  ) => void;
} = {}) {
  let pollCount = 0;

  return new GoogleVertexVideoModel(modelId, {
    provider: 'google-vertex',
    baseURL: 'https://api.example.com',
    headers: () => ({ 'api-key': 'test-key' }),
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

      if (urlString.includes(':fetchPredictOperation')) {
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
                  videos: videos.map(v => v.video),
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

describe('GoogleVertexVideoModel', () => {
  describe('constructor', () => {
    it('should expose correct provider and model information', () => {
      const model = createMockModel();

      expect(model.provider).toBe('google-vertex');
      expect(model.modelId).toBe('veo-2.0-generate-001');
      expect(model.specificationVersion).toBe('v3');
      expect(model.maxVideosPerCall).toBe(4);
    });

    it('should support different model IDs', () => {
      const model = createMockModel({ modelId: 'veo-3.0-generate-001' });

      expect(model.modelId).toBe('veo-3.0-generate-001');
    });
  });

  describe('doStart', () => {
    it('should return operation with operationName', async () => {
      const model = createMockModel({
        operationName: 'operations/my-op-123',
      });

      const result = await model.doStart({ ...defaultOptions });

      expect(result.operation).toStrictEqual({
        operationName: 'operations/my-op-123',
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

    it('should pass seed when provided', async () => {
      let capturedBody: unknown;
      const model = createMockModel({
        onRequest: (url, body) => {
          if (url.includes(':predictLongRunning')) {
            capturedBody = body;
          }
        },
      });

      await model.doStart({
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

      await model.doStart({
        ...defaultOptions,
        aspectRatio: '16:9',
      });

      expect(capturedBody).toStrictEqual({
        instances: [{ prompt }],
        parameters: { sampleCount: 1, aspectRatio: '16:9' },
      });
    });

    it('should convert resolution to Vertex format', async () => {
      let capturedBody: unknown;
      const model = createMockModel({
        onRequest: (url, body) => {
          if (url.includes(':predictLongRunning')) {
            capturedBody = body;
          }
        },
      });

      await model.doStart({
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

      await model.doStart({
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
        onRequest: (url, body) => {
          if (url.includes(':predictLongRunning')) {
            capturedBody = body;
          }
        },
      });

      await model.doStart({
        ...defaultOptions,
        n: 2,
      });

      expect(capturedBody).toStrictEqual({
        instances: [{ prompt }],
        parameters: { sampleCount: 2 },
      });
    });

    it('should return warnings array', async () => {
      const model = createMockModel();

      const result = await model.doStart({ ...defaultOptions });

      expect(result.warnings).toStrictEqual([]);
    });

    it('should throw when no operation name returned', async () => {
      const model = new GoogleVertexVideoModel('veo-2.0-generate-001', {
        provider: 'google-vertex',
        baseURL: 'https://api.example.com',
        headers: () => ({ 'api-key': 'test-key' }),
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
      });

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
      expect(result.response.modelId).toBe('veo-2.0-generate-001');
    });

    describe('Image-to-Video', () => {
      it('should send image as bytesBase64Encoded', async () => {
        let capturedBody: unknown;
        const model = createMockModel({
          onRequest: (url, body) => {
            if (url.includes(':predictLongRunning')) {
              capturedBody = body;
            }
          },
        });

        await model.doStart({
          ...defaultOptions,
          image: {
            type: 'file',
            data: 'base64-image-data',
            mediaType: 'image/png',
          },
        });

        expect(capturedBody).toMatchObject({
          instances: [
            {
              prompt,
              image: {
                bytesBase64Encoded: 'base64-image-data',
                mimeType: 'image/png',
              },
            },
          ],
          parameters: { sampleCount: 1 },
        });
      });

      it('should warn when URL-based image is provided', async () => {
        const model = createMockModel();

        const result = await model.doStart({
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

        await model.doStart({
          ...defaultOptions,
          providerOptions: {
            vertex: {
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

        await model.doStart({
          ...defaultOptions,
          providerOptions: {
            vertex: {
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

      it('should pass generateAudio option', async () => {
        let capturedBody: unknown;
        const model = createMockModel({
          onRequest: (url, body) => {
            if (url.includes(':predictLongRunning')) {
              capturedBody = body;
            }
          },
        });

        await model.doStart({
          ...defaultOptions,
          providerOptions: {
            vertex: {
              generateAudio: true,
            },
          },
        });

        expect(capturedBody).toStrictEqual({
          instances: [{ prompt }],
          parameters: {
            sampleCount: 1,
            generateAudio: true,
          },
        });
      });

      it('should pass gcsOutputDirectory option', async () => {
        let capturedBody: unknown;
        const model = createMockModel({
          onRequest: (url, body) => {
            if (url.includes(':predictLongRunning')) {
              capturedBody = body;
            }
          },
        });

        await model.doStart({
          ...defaultOptions,
          providerOptions: {
            vertex: {
              gcsOutputDirectory: 'gs://bucket/output/',
            },
          },
        });

        expect(capturedBody).toStrictEqual({
          instances: [{ prompt }],
          parameters: {
            sampleCount: 1,
            gcsOutputDirectory: 'gs://bucket/output/',
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

        await model.doStart({
          ...defaultOptions,
          providerOptions: {
            vertex: {
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
          { bytesBase64Encoded: 'reference-image-data' },
          { gcsUri: 'gs://bucket/reference.png' },
        ]);
      });
    });
  });

  describe('doStatus', () => {
    it('should return completed with video data when done', async () => {
      const model = createMockModel({
        operationName: 'operations/my-op-123',
        videos: [
          {
            video: {
              bytesBase64Encoded: 'base64-video-data',
              mimeType: 'video/mp4',
            },
          },
        ],
      });

      const result = await model.doStatus({
        operation: { operationName: 'operations/my-op-123' },
      });

      expect(result.status).toBe('completed');
      expect(result.status === 'completed' && result.videos).toStrictEqual([
        {
          type: 'base64',
          data: 'base64-video-data',
          mediaType: 'video/mp4',
        },
      ]);
    });

    it('should return pending when not done', async () => {
      const model = createMockModel({
        operationName: 'operations/my-op-123',
        pollsUntilDone: 3, // Never completes on first poll
      });

      const result = await model.doStatus({
        operation: { operationName: 'operations/my-op-123' },
      });

      expect(result.status).toBe('pending');
    });

    it('should return error status on operation error', async () => {
      const model = createMockModel({
        operationName: 'operations/my-op-123',
        operationError: {
          code: 400,
          message: 'Content policy violation',
          status: 'FAILED_PRECONDITION',
        },
      });

      const result = await model.doStatus({
        operation: { operationName: 'operations/my-op-123' },
      });

      expect(result.status).toBe('error');
      expect(result.status === 'error' && result.error).toContain(
        'Content policy violation',
      );
      expect(result).toHaveProperty('response');
      expect(result.response).toMatchObject({
        modelId: 'veo-2.0-generate-001',
      });
    });

    it('should use POST with operationName in body', async () => {
      let capturedUrl: string | undefined;
      let capturedBody: unknown;
      let capturedMethod: string | undefined;
      const model = new GoogleVertexVideoModel('veo-2.0-generate-001', {
        provider: 'google-vertex',
        baseURL: 'https://api.example.com',
        headers: () => ({ 'api-key': 'test-key' }),
        fetch: async (url, init) => {
          const urlString = url.toString();

          if (urlString.includes(':predictLongRunning')) {
            return new Response(
              JSON.stringify({
                name: 'operations/check-post',
                done: false,
              }),
              {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
              },
            );
          }

          if (urlString.includes(':fetchPredictOperation')) {
            capturedUrl = urlString;
            capturedBody = init?.body
              ? JSON.parse(init.body as string)
              : undefined;
            capturedMethod = init?.method;

            return new Response(
              JSON.stringify({
                name: 'operations/check-post',
                done: true,
                response: {
                  videos: [
                    {
                      bytesBase64Encoded: 'video-data',
                      mimeType: 'video/mp4',
                    },
                  ],
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
      });

      await model.doStatus({
        operation: { operationName: 'operations/check-post' },
      });

      expect(capturedUrl).toContain(':fetchPredictOperation');
      expect(capturedMethod).toBe('POST');
      expect(capturedBody).toStrictEqual({
        operationName: 'operations/check-post',
      });
    });

    it('should return completed with GCS URI video', async () => {
      const model = createMockModel({
        operationName: 'operations/gcs-op',
        videos: [
          {
            video: {
              gcsUri: 'gs://bucket/video.mp4',
              mimeType: 'video/mp4',
            },
          },
        ],
      });

      const result = await model.doStatus({
        operation: { operationName: 'operations/gcs-op' },
      });

      expect(result.status).toBe('completed');
      expect(result.status === 'completed' && result.videos).toStrictEqual([
        {
          type: 'url',
          url: 'gs://bucket/video.mp4',
          mediaType: 'video/mp4',
        },
      ]);
    });
  });
});
