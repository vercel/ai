import { describe, expect, it, vi } from 'vitest';
import { ReplicateVideoModel } from './replicate-video-model';

vi.mock('./version', () => ({
  VERSION: '0.0.0-test',
}));

const prompt = 'A rocket launching into space';

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
  modelId = 'minimax/video-01',
  currentDate,
  predictionId = 'test-prediction-id',
  predictionStatus = 'succeeded',
  output = 'https://replicate.delivery/video.mp4',
  error,
  onRequest,
  apiToken = 'test-api-token',
  metrics = { predict_time: 25.5 },
}: {
  modelId?: string;
  currentDate?: () => Date;
  predictionId?: string;
  predictionStatus?: string;
  output?: string | null;
  error?: string;
  onRequest?: (
    url: string,
    body: unknown,
    headers: Record<string, string>,
  ) => void;
  apiToken?: string;
  metrics?: { predict_time?: number | null } | null;
} = {}) {
  return new ReplicateVideoModel(modelId, {
    provider: 'replicate.video',
    baseURL: 'https://api.replicate.com/v1',
    headers: () => ({
      Authorization: `Bearer ${apiToken}`,
    }),
    fetch: async (url, init) => {
      const urlString = url.toString();
      const body = init?.body ? JSON.parse(init.body as string) : {};
      const headers = (init?.headers as Record<string, string>) ?? {};

      onRequest?.(urlString, body, headers);

      if (
        urlString.includes('/predictions') &&
        init?.method !== 'GET' &&
        !urlString.includes(predictionId)
      ) {
        return new Response(
          JSON.stringify({
            id: predictionId,
            status: predictionStatus,
            output,
            error: error ?? null,
            urls: {
              get: `https://api.replicate.com/v1/predictions/${predictionId}`,
            },
            metrics,
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          },
        );
      }

      if (urlString.includes(`/predictions/${predictionId}`)) {
        return new Response(
          JSON.stringify({
            id: predictionId,
            status: predictionStatus,
            output,
            error: error ?? null,
            urls: {
              get: `https://api.replicate.com/v1/predictions/${predictionId}`,
            },
            metrics,
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

describe('ReplicateVideoModel', () => {
  describe('constructor', () => {
    it('should expose correct provider and model information', () => {
      const model = createMockModel();

      expect(model.provider).toBe('replicate.video');
      expect(model.modelId).toBe('minimax/video-01');
      expect(model.specificationVersion).toBe('v3');
      expect(model.maxVideosPerCall).toBe(1);
    });

    it('should support model IDs with versions', () => {
      const model = createMockModel({
        modelId: 'stability-ai/stable-video-diffusion:abc123',
      });

      expect(model.modelId).toBe('stability-ai/stable-video-diffusion:abc123');
    });
  });

  describe('doStart', () => {
    it('should return operation with getUrl', async () => {
      const model = createMockModel({
        predictionId: 'start-pred-123',
      });

      const result = await model.doStart({ ...defaultOptions });

      expect(result.operation).toStrictEqual({
        getUrl: 'https://api.replicate.com/v1/predictions/start-pred-123',
      });
    });

    it('should pass correct request body', async () => {
      let capturedBody: unknown;
      const model = createMockModel({
        onRequest: (url, body) => {
          if (
            url.includes('/predictions') &&
            !url.includes('test-prediction')
          ) {
            capturedBody = body;
          }
        },
      });

      await model.doStart({ ...defaultOptions });

      expect(capturedBody).toMatchObject({
        input: { prompt },
      });
    });

    it('should NOT send prefer header', async () => {
      let capturedHeaders: Record<string, string> = {};
      const model = createMockModel({
        onRequest: (url, _body, headers) => {
          if (
            url.includes('/predictions') &&
            !url.includes('test-prediction')
          ) {
            capturedHeaders = headers;
          }
        },
      });

      await model.doStart({ ...defaultOptions });

      expect(capturedHeaders.prefer).toBeUndefined();
    });

    it('should use correct URL for versioned models', async () => {
      let capturedUrl: string = '';
      let capturedBody: unknown;
      const model = createMockModel({
        modelId: 'stability-ai/stable-video-diffusion:abc123',
        onRequest: (url, body) => {
          if (
            url.includes('/predictions') &&
            !url.includes('test-prediction')
          ) {
            capturedUrl = url;
            capturedBody = body;
          }
        },
      });

      await model.doStart({ ...defaultOptions });

      expect(capturedUrl).toBe('https://api.replicate.com/v1/predictions');
      expect(capturedBody).toMatchObject({
        version: 'abc123',
      });
    });

    it('should use /models/ URL for unversioned models', async () => {
      let capturedUrl: string = '';
      const model = createMockModel({
        modelId: 'minimax/video-01',
        onRequest: url => {
          if (
            url.includes('/predictions') &&
            !url.includes('test-prediction')
          ) {
            capturedUrl = url;
          }
        },
      });

      await model.doStart({ ...defaultOptions });

      expect(capturedUrl).toBe(
        'https://api.replicate.com/v1/models/minimax/video-01/predictions',
      );
    });

    it('should return warnings and response metadata', async () => {
      const testDate = new Date('2024-01-01T00:00:00Z');
      const model = createMockModel({
        currentDate: () => testDate,
      });

      const result = await model.doStart({ ...defaultOptions });

      expect(result.warnings).toStrictEqual([]);
      expect(result.response.timestamp).toStrictEqual(testDate);
      expect(result.response.modelId).toBe('minimax/video-01');
    });

    it('should pass webhookUrl as webhook body parameter', async () => {
      let capturedBody: unknown;
      const model = createMockModel({
        onRequest: (url, body) => {
          if (
            url.includes('/predictions') &&
            !url.includes('test-prediction')
          ) {
            capturedBody = body;
          }
        },
      });

      await model.doStart({
        ...defaultOptions,
        webhookUrl: 'https://example.com/webhook',
      });

      expect(capturedBody).toMatchObject({
        webhook: 'https://example.com/webhook',
        webhook_events_filter: ['completed'],
      });
    });

    it('should NOT include webhook when webhookUrl is not provided', async () => {
      let capturedBody: Record<string, unknown> = {};
      const model = createMockModel({
        onRequest: (url, body) => {
          if (
            url.includes('/predictions') &&
            !url.includes('test-prediction')
          ) {
            capturedBody = body as Record<string, unknown>;
          }
        },
      });

      await model.doStart({ ...defaultOptions });

      expect(capturedBody.webhook).toBeUndefined();
      expect(capturedBody.webhook_events_filter).toBeUndefined();
    });

    it('should pass seed when provided', async () => {
      let capturedBody: unknown;
      const model = createMockModel({
        onRequest: (url, body) => {
          if (
            url.includes('/predictions') &&
            !url.includes('test-prediction')
          ) {
            capturedBody = body;
          }
        },
      });

      await model.doStart({
        ...defaultOptions,
        seed: 42,
      });

      expect(capturedBody).toMatchObject({
        input: {
          prompt,
          seed: 42,
        },
      });
    });

    it('should pass aspect ratio when provided', async () => {
      let capturedBody: unknown;
      const model = createMockModel({
        onRequest: (url, body) => {
          if (
            url.includes('/predictions') &&
            !url.includes('test-prediction')
          ) {
            capturedBody = body;
          }
        },
      });

      await model.doStart({
        ...defaultOptions,
        aspectRatio: '16:9',
      });

      expect(capturedBody).toMatchObject({
        input: {
          prompt,
          aspect_ratio: '16:9',
        },
      });
    });

    it('should pass through 9:16 aspect ratio', async () => {
      let capturedBody: unknown;
      const model = createMockModel({
        onRequest: (url, body) => {
          if (
            url.includes('/predictions') &&
            !url.includes('test-prediction')
          ) {
            capturedBody = body;
          }
        },
      });

      await model.doStart({
        ...defaultOptions,
        aspectRatio: '9:16',
      });

      expect(capturedBody).toMatchObject({
        input: {
          prompt,
          aspect_ratio: '9:16',
        },
      });
    });

    it('should pass through 1:1 aspect ratio', async () => {
      let capturedBody: unknown;
      const model = createMockModel({
        onRequest: (url, body) => {
          if (
            url.includes('/predictions') &&
            !url.includes('test-prediction')
          ) {
            capturedBody = body;
          }
        },
      });

      await model.doStart({
        ...defaultOptions,
        aspectRatio: '1:1',
      });

      expect(capturedBody).toMatchObject({
        input: {
          prompt,
          aspect_ratio: '1:1',
        },
      });
    });

    it('should pass through other aspect ratios', async () => {
      let capturedBody: unknown;
      const model = createMockModel({
        onRequest: (url, body) => {
          if (
            url.includes('/predictions') &&
            !url.includes('test-prediction')
          ) {
            capturedBody = body;
          }
        },
      });

      await model.doStart({
        ...defaultOptions,
        aspectRatio: '4:3',
      });

      expect(capturedBody).toMatchObject({
        input: {
          prompt,
          aspect_ratio: '4:3', // Unmapped ratios pass through
        },
      });
    });

    it('should pass resolution as size when provided', async () => {
      let capturedBody: unknown;
      const model = createMockModel({
        onRequest: (url, body) => {
          if (
            url.includes('/predictions') &&
            !url.includes('test-prediction')
          ) {
            capturedBody = body;
          }
        },
      });

      await model.doStart({
        ...defaultOptions,
        resolution: '1920x1080',
      });

      expect(capturedBody).toMatchObject({
        input: {
          prompt,
          size: '1920x1080',
        },
      });
    });

    it('should pass duration when provided', async () => {
      let capturedBody: unknown;
      const model = createMockModel({
        onRequest: (url, body) => {
          if (
            url.includes('/predictions') &&
            !url.includes('test-prediction')
          ) {
            capturedBody = body;
          }
        },
      });

      await model.doStart({
        ...defaultOptions,
        duration: 5,
      });

      expect(capturedBody).toMatchObject({
        input: {
          prompt,
          duration: 5,
        },
      });
    });

    it('should pass fps when provided', async () => {
      let capturedBody: unknown;
      const model = createMockModel({
        onRequest: (url, body) => {
          if (
            url.includes('/predictions') &&
            !url.includes('test-prediction')
          ) {
            capturedBody = body;
          }
        },
      });

      await model.doStart({
        ...defaultOptions,
        fps: 30,
      });

      expect(capturedBody).toMatchObject({
        input: {
          prompt,
          fps: 30,
        },
      });
    });

    it('should send URL-based image directly', async () => {
      let capturedBody: unknown;
      const model = createMockModel({
        onRequest: (url, body) => {
          if (
            url.includes('/predictions') &&
            !url.includes('test-prediction')
          ) {
            capturedBody = body;
          }
        },
      });

      await model.doStart({
        ...defaultOptions,
        image: {
          type: 'url',
          url: 'https://example.com/image.png',
        },
      });

      const body = capturedBody as { input: { image: string } };
      expect(body.input.image).toBe('https://example.com/image.png');
    });

    it('should convert base64 image to data URI', async () => {
      let capturedBody: unknown;
      const model = createMockModel({
        onRequest: (url, body) => {
          if (
            url.includes('/predictions') &&
            !url.includes('test-prediction')
          ) {
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

      const body = capturedBody as { input: { image: string } };
      expect(body.input.image).toBe('data:image/png;base64,base64-image-data');
    });

    it('should pass guidance_scale option', async () => {
      let capturedBody: unknown;
      const model = createMockModel({
        onRequest: (url, body) => {
          if (
            url.includes('/predictions') &&
            !url.includes('test-prediction')
          ) {
            capturedBody = body;
          }
        },
      });

      await model.doStart({
        ...defaultOptions,
        providerOptions: {
          replicate: {
            guidance_scale: 7.5,
          },
        },
      });

      const body = capturedBody as { input: Record<string, unknown> };
      expect(body.input.guidance_scale).toBe(7.5);
    });

    it('should pass num_inference_steps option', async () => {
      let capturedBody: unknown;
      const model = createMockModel({
        onRequest: (url, body) => {
          if (
            url.includes('/predictions') &&
            !url.includes('test-prediction')
          ) {
            capturedBody = body;
          }
        },
      });

      await model.doStart({
        ...defaultOptions,
        providerOptions: {
          replicate: {
            num_inference_steps: 50,
          },
        },
      });

      const body = capturedBody as { input: Record<string, unknown> };
      expect(body.input.num_inference_steps).toBe(50);
    });

    it('should pass motion_bucket_id for Stable Video Diffusion', async () => {
      let capturedBody: unknown;
      const model = createMockModel({
        onRequest: (url, body) => {
          if (
            url.includes('/predictions') &&
            !url.includes('test-prediction')
          ) {
            capturedBody = body;
          }
        },
      });

      await model.doStart({
        ...defaultOptions,
        providerOptions: {
          replicate: {
            motion_bucket_id: 127,
          },
        },
      });

      const body = capturedBody as { input: Record<string, unknown> };
      expect(body.input.motion_bucket_id).toBe(127);
    });

    it('should pass prompt_optimizer for MiniMax', async () => {
      let capturedBody: unknown;
      const model = createMockModel({
        onRequest: (url, body) => {
          if (
            url.includes('/predictions') &&
            !url.includes('test-prediction')
          ) {
            capturedBody = body;
          }
        },
      });

      await model.doStart({
        ...defaultOptions,
        providerOptions: {
          replicate: {
            prompt_optimizer: true,
          },
        },
      });

      const body = capturedBody as { input: Record<string, unknown> };
      expect(body.input.prompt_optimizer).toBe(true);
    });

    it('should pass through custom options', async () => {
      let capturedBody: unknown;
      const model = createMockModel({
        onRequest: (url, body) => {
          if (
            url.includes('/predictions') &&
            !url.includes('test-prediction')
          ) {
            capturedBody = body;
          }
        },
      });

      await model.doStart({
        ...defaultOptions,
        providerOptions: {
          replicate: {
            custom_param: 'custom_value',
          },
        },
      });

      const body = capturedBody as { input: Record<string, unknown> };
      expect(body.input.custom_param).toBe('custom_value');
    });
  });

  describe('doStatus', () => {
    function createStatusModel({
      predictionId = 'status-pred-123',
      predictionStatus = 'succeeded',
      output = 'https://replicate.delivery/video.mp4',
      error,
      currentDate,
      metrics = { predict_time: 25.5 },
      apiToken = 'test-api-token',
    }: {
      predictionId?: string;
      predictionStatus?: string;
      output?: string | null;
      error?: string;
      currentDate?: () => Date;
      metrics?: { predict_time?: number | null } | null;
      apiToken?: string;
    } = {}) {
      return new ReplicateVideoModel('minimax/video-01', {
        provider: 'replicate.video',
        baseURL: 'https://api.replicate.com/v1',
        headers: () => ({
          Authorization: `Bearer ${apiToken}`,
        }),
        fetch: async url => {
          const urlString = url.toString();

          if (urlString.includes(`/predictions/${predictionId}`)) {
            return new Response(
              JSON.stringify({
                id: predictionId,
                status: predictionStatus,
                output,
                error: error ?? null,
                urls: {
                  get: `https://api.replicate.com/v1/predictions/${predictionId}`,
                },
                metrics,
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

    it('should return completed with video data when succeeded', async () => {
      const model = createStatusModel({
        predictionStatus: 'succeeded',
        output: 'https://replicate.delivery/video-output.mp4',
      });

      const result = await model.doStatus({
        operation: {
          getUrl: 'https://api.replicate.com/v1/predictions/status-pred-123',
        },
      });

      expect(result.status).toBe('completed');
      expect(result.status === 'completed' && result.videos).toStrictEqual([
        {
          type: 'url',
          url: 'https://replicate.delivery/video-output.mp4',
          mediaType: 'video/mp4',
        },
      ]);
    });

    it('should return pending when processing', async () => {
      const model = createStatusModel({
        predictionStatus: 'processing',
      });

      const result = await model.doStatus({
        operation: {
          getUrl: 'https://api.replicate.com/v1/predictions/status-pred-123',
        },
      });

      expect(result.status).toBe('pending');
    });

    it('should return pending when starting', async () => {
      const model = createStatusModel({
        predictionStatus: 'starting',
      });

      const result = await model.doStatus({
        operation: {
          getUrl: 'https://api.replicate.com/v1/predictions/status-pred-123',
        },
      });

      expect(result.status).toBe('pending');
    });

    it('should return error status on failed prediction', async () => {
      const model = createStatusModel({
        predictionStatus: 'failed',
        error: 'GPU out of memory',
      });

      const result = await model.doStatus({
        operation: {
          getUrl: 'https://api.replicate.com/v1/predictions/status-pred-123',
        },
      });

      expect(result.status).toBe('error');
      expect(result.status === 'error' && result.error).toContain(
        'GPU out of memory',
      );
    });

    it('should return error status on canceled prediction', async () => {
      const model = createStatusModel({
        predictionStatus: 'canceled',
      });

      const result = await model.doStatus({
        operation: {
          getUrl: 'https://api.replicate.com/v1/predictions/status-pred-123',
        },
      });

      expect(result.status).toBe('error');
      expect(result.status === 'error' && result.error).toContain('canceled');
    });

    it('should throw when no output on succeeded', async () => {
      const model = createStatusModel({
        predictionStatus: 'succeeded',
        output: null,
      });

      await expect(
        model.doStatus({
          operation: {
            getUrl: 'https://api.replicate.com/v1/predictions/status-pred-123',
          },
        }),
      ).rejects.toMatchObject({
        message: 'No video URL in response',
      });
    });

    it('should include providerMetadata', async () => {
      const model = createStatusModel({
        predictionId: 'meta-pred-456',
        predictionStatus: 'succeeded',
        output: 'https://replicate.delivery/video.mp4',
        metrics: { predict_time: 30.2 },
      });

      const result = await model.doStatus({
        operation: {
          getUrl: 'https://api.replicate.com/v1/predictions/meta-pred-456',
        },
      });

      expect(result.status).toBe('completed');
      if (result.status === 'completed') {
        expect(result.providerMetadata).toMatchObject({
          replicate: {
            predictionId: 'meta-pred-456',
            metrics: { predict_time: 30.2 },
            videos: [{ url: 'https://replicate.delivery/video.mp4' }],
          },
        });
      }
    });

    it('should include response metadata', async () => {
      const testDate = new Date('2024-06-15T12:00:00Z');
      const model = createStatusModel({
        currentDate: () => testDate,
        predictionStatus: 'processing',
      });

      const result = await model.doStatus({
        operation: {
          getUrl: 'https://api.replicate.com/v1/predictions/status-pred-123',
        },
      });

      expect(result.response.timestamp).toStrictEqual(testDate);
      expect(result.response.modelId).toBe('minimax/video-01');
    });
  });
});
