import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import { describe, expect, it } from 'vitest';
import { XaiVideoModel } from './xai-video-model';

const prompt = 'A chicken flying into the sunset';

const TEST_BASE_URL = 'https://api.example.com';

const createVideoResponse = {
  request_id: 'req-123',
};

const doneStatusResponse = {
  status: 'done',
  video: {
    url: 'https://vidgen.x.ai/output/video-001.mp4',
    duration: 5,
    respect_moderation: true,
  },
  model: 'grok-imagine-video',
};

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
    xai: {
      pollIntervalMs: 10,
      pollTimeoutMs: 5000,
    },
  },
} as const;

function createModel({
  headers,
  currentDate,
}: {
  headers?: () => Record<string, string>;
  currentDate?: () => Date;
} = {}) {
  return new XaiVideoModel('grok-imagine-video', {
    provider: 'xai.video',
    baseURL: TEST_BASE_URL,
    headers: headers ?? (() => ({ 'api-key': 'test-key' })),
    _internal: {
      currentDate,
    },
  });
}

describe('XaiVideoModel', () => {
  const server = createTestServer({
    [`${TEST_BASE_URL}/videos/generations`]: {
      response: {
        type: 'json-value',
        body: createVideoResponse,
      },
    },
    [`${TEST_BASE_URL}/videos/edits`]: {
      response: {
        type: 'json-value',
        body: createVideoResponse,
      },
    },
    [`${TEST_BASE_URL}/videos/req-123`]: {
      response: {
        type: 'json-value',
        body: doneStatusResponse,
      },
    },
  });

  describe('constructor', () => {
    it('should expose correct provider and model information', () => {
      const model = createModel();

      expect(model.provider).toBe('xai.video');
      expect(model.modelId).toBe('grok-imagine-video');
      expect(model.specificationVersion).toBe('v3');
      expect(model.maxVideosPerCall).toBe(1);
    });
  });

  describe('doGenerate', () => {
    it('should send correct request body with model and prompt', async () => {
      const model = createModel();

      await model.doGenerate({ ...defaultOptions });

      expect(server.calls[0].requestMethod).toBe('POST');
      expect(server.calls[0].requestUrl).toBe(
        `${TEST_BASE_URL}/videos/generations`,
      );
      expect(await server.calls[0].requestBodyJson).toStrictEqual({
        model: 'grok-imagine-video',
        prompt,
      });
    });

    it('should poll the correct status URL', async () => {
      const model = createModel();

      await model.doGenerate({ ...defaultOptions });

      expect(server.calls[1].requestMethod).toBe('GET');
      expect(server.calls[1].requestUrl).toBe(
        `${TEST_BASE_URL}/videos/req-123`,
      );
    });

    it('should send duration in request body', async () => {
      const model = createModel();

      await model.doGenerate({ ...defaultOptions, duration: 10 });

      const body = await server.calls[0].requestBodyJson;
      expect(body).toMatchObject({ duration: 10 });
    });

    it('should send aspect_ratio in request body', async () => {
      const model = createModel();

      await model.doGenerate({ ...defaultOptions, aspectRatio: '9:16' });

      const body = await server.calls[0].requestBodyJson;
      expect(body).toMatchObject({ aspect_ratio: '9:16' });
    });

    it('should map SDK resolution 1280x720 to 720p', async () => {
      const model = createModel();

      await model.doGenerate({ ...defaultOptions, resolution: '1280x720' });

      const body = await server.calls[0].requestBodyJson;
      expect(body).toMatchObject({ resolution: '720p' });
    });

    it('should map SDK resolution 854x480 to 480p', async () => {
      const model = createModel();

      await model.doGenerate({ ...defaultOptions, resolution: '854x480' });

      const body = await server.calls[0].requestBodyJson;
      expect(body).toMatchObject({ resolution: '480p' });
    });

    it('should prefer provider option resolution over SDK resolution', async () => {
      const model = createModel();

      await model.doGenerate({
        ...defaultOptions,
        resolution: '1280x720',
        providerOptions: {
          xai: {
            resolution: '480p',
            pollIntervalMs: 10,
            pollTimeoutMs: 5000,
          },
        },
      });

      const body = await server.calls[0].requestBodyJson;
      expect(body).toMatchObject({ resolution: '480p' });
    });

    it('should warn for unrecognized resolution format', async () => {
      const model = createModel();

      const result = await model.doGenerate({
        ...defaultOptions,
        resolution: '1920x1080',
      });

      expect(result.warnings).toContainEqual(
        expect.objectContaining({
          type: 'unsupported',
          feature: 'resolution',
        }),
      );
    });

    it('should send image object from URL-based image input', async () => {
      const model = createModel();

      await model.doGenerate({
        ...defaultOptions,
        image: {
          type: 'url',
          url: 'https://example.com/image.png',
        },
      });

      const body = await server.calls[0].requestBodyJson;
      expect(body).toMatchObject({
        image: { url: 'https://example.com/image.png' },
      });
    });

    it('should send image object with data URI from file data', async () => {
      const model = createModel();
      const imageData = new Uint8Array([137, 80, 78, 71]); // PNG magic bytes

      await model.doGenerate({
        ...defaultOptions,
        image: {
          type: 'file',
          data: imageData,
          mediaType: 'image/png',
        },
      });

      const body = await server.calls[0].requestBodyJson;
      expect(body).toMatchObject({
        image: { url: 'data:image/png;base64,iVBORw==' },
      });
    });

    it('should send image object with data URI from base64 string', async () => {
      const model = createModel();

      await model.doGenerate({
        ...defaultOptions,
        image: {
          type: 'file',
          data: 'aGVsbG8=',
          mediaType: 'image/jpeg',
        },
      });

      const body = await server.calls[0].requestBodyJson;
      expect(body).toMatchObject({
        image: { url: 'data:image/jpeg;base64,aGVsbG8=' },
      });
    });

    it('should send video object to /videos/edits for video editing', async () => {
      const model = createModel();

      await model.doGenerate({
        ...defaultOptions,
        providerOptions: {
          xai: {
            videoUrl: 'https://example.com/source-video.mp4',
            pollIntervalMs: 10,
            pollTimeoutMs: 5000,
          },
        },
      });

      expect(server.calls[0].requestMethod).toBe('POST');
      expect(server.calls[0].requestUrl).toBe(`${TEST_BASE_URL}/videos/edits`);
      const body = await server.calls[0].requestBodyJson;
      expect(body).toMatchObject({
        video: { url: 'https://example.com/source-video.mp4' },
      });
    });

    it('should warn about duration in edit mode', async () => {
      const model = createModel();

      const result = await model.doGenerate({
        ...defaultOptions,
        duration: 10,
        providerOptions: {
          xai: {
            videoUrl: 'https://example.com/source-video.mp4',
            pollIntervalMs: 10,
            pollTimeoutMs: 5000,
          },
        },
      });

      expect(result.warnings).toContainEqual(
        expect.objectContaining({
          type: 'unsupported',
          feature: 'duration',
        }),
      );
    });

    it('should warn about aspectRatio in edit mode', async () => {
      const model = createModel();

      const result = await model.doGenerate({
        ...defaultOptions,
        aspectRatio: '16:9',
        providerOptions: {
          xai: {
            videoUrl: 'https://example.com/source-video.mp4',
            pollIntervalMs: 10,
            pollTimeoutMs: 5000,
          },
        },
      });

      expect(result.warnings).toContainEqual(
        expect.objectContaining({
          type: 'unsupported',
          feature: 'aspectRatio',
        }),
      );
    });

    it('should warn about resolution in edit mode', async () => {
      const model = createModel();

      const result = await model.doGenerate({
        ...defaultOptions,
        resolution: '1280x720',
        providerOptions: {
          xai: {
            videoUrl: 'https://example.com/source-video.mp4',
            pollIntervalMs: 10,
            pollTimeoutMs: 5000,
          },
        },
      });

      expect(result.warnings).toContainEqual(
        expect.objectContaining({
          type: 'unsupported',
          feature: 'resolution',
        }),
      );
    });

    it('should not warn about duration outside edit mode', async () => {
      const model = createModel();

      const result = await model.doGenerate({
        ...defaultOptions,
        duration: 10,
      });

      expect(result.warnings).not.toContainEqual(
        expect.objectContaining({
          feature: 'duration',
        }),
      );
    });

    it('should not warn about aspectRatio outside edit mode', async () => {
      const model = createModel();

      const result = await model.doGenerate({
        ...defaultOptions,
        aspectRatio: '16:9',
      });

      expect(result.warnings).not.toContainEqual(
        expect.objectContaining({
          feature: 'aspectRatio',
        }),
      );
    });

    it('should not warn about resolution outside edit mode', async () => {
      const model = createModel();

      const result = await model.doGenerate({
        ...defaultOptions,
        resolution: '1280x720',
      });

      expect(result.warnings).not.toContainEqual(
        expect.objectContaining({
          feature: 'resolution',
        }),
      );
    });

    it('should omit duration, aspect_ratio, and resolution from body in edit mode', async () => {
      const model = createModel();

      await model.doGenerate({
        ...defaultOptions,
        duration: 10,
        aspectRatio: '16:9',
        resolution: '1280x720',
        providerOptions: {
          xai: {
            videoUrl: 'https://example.com/source-video.mp4',
            pollIntervalMs: 10,
            pollTimeoutMs: 5000,
          },
        },
      });

      const body = await server.calls[0].requestBodyJson;
      expect(body).not.toHaveProperty('duration');
      expect(body).not.toHaveProperty('aspect_ratio');
      expect(body).not.toHaveProperty('resolution');
    });

    it('should pass headers to requests', async () => {
      const model = createModel({
        headers: () => ({
          Authorization: 'Bearer custom-token',
          'X-Custom': 'value',
        }),
      });

      await model.doGenerate({
        ...defaultOptions,
        headers: {
          'X-Request-Header': 'request-value',
        },
      });

      expect(server.calls[0].requestHeaders).toMatchObject({
        authorization: 'Bearer custom-token',
        'x-custom': 'value',
        'x-request-header': 'request-value',
      });

      // Poll request should also have headers
      expect(server.calls[1].requestHeaders).toMatchObject({
        authorization: 'Bearer custom-token',
        'x-custom': 'value',
        'x-request-header': 'request-value',
      });
    });

    it('should return video with correct URL and media type', async () => {
      const model = createModel();

      const result = await model.doGenerate({ ...defaultOptions });

      expect(result.videos).toHaveLength(1);
      expect(result.videos[0]).toStrictEqual({
        type: 'url',
        url: 'https://vidgen.x.ai/output/video-001.mp4',
        mediaType: 'video/mp4',
      });
    });

    it('should handle done response without status field', async () => {
      server.urls[`${TEST_BASE_URL}/videos/req-123`].response = {
        type: 'json-value',
        body: {
          video: {
            url: 'https://vidgen.x.ai/output/video-001.mp4',
            duration: 5,
            respect_moderation: true,
          },
          model: 'grok-imagine-video',
        },
      };

      const model = createModel();

      const result = await model.doGenerate({ ...defaultOptions });

      expect(result.videos).toHaveLength(1);
      expect(result.videos[0]).toStrictEqual({
        type: 'url',
        url: 'https://vidgen.x.ai/output/video-001.mp4',
        mediaType: 'video/mp4',
      });

      // Reset
      server.urls[`${TEST_BASE_URL}/videos/req-123`].response = {
        type: 'json-value',
        body: doneStatusResponse,
      };
    });

    it('should return empty warnings for supported features', async () => {
      const model = createModel();

      const result = await model.doGenerate({ ...defaultOptions });

      expect(result.warnings).toStrictEqual([]);
    });

    it('should warn about unsupported fps', async () => {
      const model = createModel();

      const result = await model.doGenerate({
        ...defaultOptions,
        fps: 30,
      });

      expect(result.warnings).toContainEqual(
        expect.objectContaining({
          type: 'unsupported',
          feature: 'fps',
        }),
      );
    });

    it('should warn about unsupported seed', async () => {
      const model = createModel();

      const result = await model.doGenerate({
        ...defaultOptions,
        seed: 42,
      });

      expect(result.warnings).toContainEqual(
        expect.objectContaining({
          type: 'unsupported',
          feature: 'seed',
        }),
      );
    });

    it('should warn when n > 1', async () => {
      const model = createModel();

      const result = await model.doGenerate({
        ...defaultOptions,
        n: 3,
      });

      expect(result.warnings).toContainEqual(
        expect.objectContaining({
          type: 'unsupported',
          feature: 'n',
        }),
      );
    });

    it('should not warn when n is 1', async () => {
      const model = createModel();

      const result = await model.doGenerate({
        ...defaultOptions,
        n: 1,
      });

      expect(result.warnings).not.toContainEqual(
        expect.objectContaining({
          feature: 'n',
        }),
      );
    });
  });

  describe('response metadata', () => {
    it('should include timestamp, headers, and modelId in response', async () => {
      const testDate = new Date('2024-01-01T00:00:00Z');
      const model = createModel({
        currentDate: () => testDate,
      });

      const result = await model.doGenerate({ ...defaultOptions });

      expect(result.response).toStrictEqual({
        timestamp: testDate,
        modelId: 'grok-imagine-video',
        headers: expect.any(Object),
      });
    });
  });

  describe('providerMetadata', () => {
    it('should include requestId, videoUrl, and duration', async () => {
      const model = createModel();

      const result = await model.doGenerate({ ...defaultOptions });

      expect(result.providerMetadata).toStrictEqual({
        xai: {
          requestId: 'req-123',
          videoUrl: 'https://vidgen.x.ai/output/video-001.mp4',
          duration: 5,
        },
      });
    });
  });

  describe('error handling', () => {
    it('should throw when status is expired', async () => {
      server.urls[`${TEST_BASE_URL}/videos/req-123`].response = {
        type: 'json-value',
        body: {
          status: 'expired',
          model: 'grok-imagine-video',
        },
      };

      const model = createModel();

      await expect(model.doGenerate({ ...defaultOptions })).rejects.toThrow(
        'expired',
      );

      // Reset
      server.urls[`${TEST_BASE_URL}/videos/req-123`].response = {
        type: 'json-value',
        body: doneStatusResponse,
      };
    });

    it('should throw when no request_id is returned', async () => {
      server.urls[`${TEST_BASE_URL}/videos/generations`].response = {
        type: 'json-value',
        body: {},
      };

      const model = createModel();

      await expect(model.doGenerate({ ...defaultOptions })).rejects.toThrow(
        'No request_id',
      );

      // Reset
      server.urls[`${TEST_BASE_URL}/videos/generations`].response = {
        type: 'json-value',
        body: createVideoResponse,
      };
    });

    it('should throw when video URL is missing on done status', async () => {
      server.urls[`${TEST_BASE_URL}/videos/req-123`].response = {
        type: 'json-value',
        body: {
          status: 'done',
          video: null,
          model: 'grok-imagine-video',
        },
      };

      const model = createModel();

      await expect(model.doGenerate({ ...defaultOptions })).rejects.toThrow(
        'no video URL',
      );

      // Reset
      server.urls[`${TEST_BASE_URL}/videos/req-123`].response = {
        type: 'json-value',
        body: doneStatusResponse,
      };
    });

    it('should throw on timeout', async () => {
      server.urls[`${TEST_BASE_URL}/videos/req-123`].response = {
        type: 'json-value',
        body: {
          status: 'pending',
          model: 'grok-imagine-video',
        },
      };

      const model = createModel();

      await expect(
        model.doGenerate({
          ...defaultOptions,
          providerOptions: {
            xai: {
              pollIntervalMs: 10,
              pollTimeoutMs: 50,
            },
          },
        }),
      ).rejects.toThrow('timed out');

      // Reset
      server.urls[`${TEST_BASE_URL}/videos/req-123`].response = {
        type: 'json-value',
        body: doneStatusResponse,
      };
    });
  });
});
