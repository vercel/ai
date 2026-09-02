import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import { describe, expect, it } from 'vitest';
import { TopazVideoModel } from './topaz-video-model';

const TEST_BASE_URL = 'https://api.topazlabs.com';
const REQUEST_ID = 'req-abc-123';
const UPLOAD_URL = 'https://uploads.topazlabs.example.com/part-1';
const UPLOAD_URL_2 = 'https://uploads.topazlabs.example.com/part-2';
const DOWNLOAD_URL = 'https://cdn.topazlabs.example.com/out.mp4';

const inputVideo = {
  type: 'file' as const,
  mediaType: 'video/mp4',
  data: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]),
};

/**
 * Topaz needs source metadata up front, so the happy-path options carry the
 * pieces that cannot be derived from the request.
 */
const sourceOptions = {
  source: {
    width: 1920,
    height: 1080,
    duration: 10,
    frameRate: 30,
    frameCount: 300,
  },
};

const defaultOptions = {
  prompt: undefined,
  n: 1,
  image: undefined,
  frameImages: undefined,
  inputReferences: [inputVideo],
  aspectRatio: undefined,
  resolution: undefined,
  duration: undefined,
  fps: undefined,
  generateAudio: undefined,
  seed: undefined,
  providerOptions: { topaz: sourceOptions },
} as const;

function createModel(modelId = 'starlight-precise-2.6') {
  return new TopazVideoModel(modelId, {
    provider: 'topaz.video',
    baseURL: TEST_BASE_URL,
    headers: () => ({ 'X-API-Key': 'test-key' }),
    _internal: { currentDate: () => new Date('2026-01-01T00:00:00Z') },
  });
}

describe('TopazVideoModel', () => {
  const server = createTestServer({
    [`${TEST_BASE_URL}/video/`]: {
      response: {
        type: 'json-value',
        body: { requestId: REQUEST_ID, estimates: { cost: [12], time: [60] } },
      },
    },
    [`${TEST_BASE_URL}/video/${REQUEST_ID}/accept`]: {
      response: {
        type: 'json-value',
        body: { uploadId: 'upload-1', urls: [UPLOAD_URL] },
      },
    },
    [UPLOAD_URL]: {
      response: {
        // `json-value` rather than `empty` because the test server only
        // applies custom headers (here, the ETag) on a body-carrying response.
        type: 'json-value',
        body: {},
        headers: { etag: '"etag-part-1"' },
      },
    },
    // Only used by the multipart-upload test; the default accept response
    // returns a single URL.
    [UPLOAD_URL_2]: {
      response: {
        type: 'json-value',
        body: {},
        headers: { etag: '"etag-part-2"' },
      },
    },
    [`${TEST_BASE_URL}/video/${REQUEST_ID}/complete-upload`]: {
      response: { type: 'json-value', body: { message: 'queued' } },
    },
    [`${TEST_BASE_URL}/video/${REQUEST_ID}/status`]: {
      response: {
        type: 'json-value',
        body: {
          status: 'complete',
          progress: 100,
          outputSize: 12345,
          estimates: { cost: [12], time: [60] },
          download: { url: DOWNLOAD_URL, expiresIn: 3600 },
        },
      },
    },
  });

  describe('constructor', () => {
    it('exposes provider and model information', () => {
      const model = createModel();

      expect(model.provider).toBe('topaz.video');
      expect(model.modelId).toBe('starlight-precise-2.6');
      expect(model.specificationVersion).toBe('v4');
      expect(model.maxVideosPerCall).toBe(1);
    });
  });

  describe('doStart', () => {
    it('runs create, accept, upload and complete-upload in order', async () => {
      const result = await createModel().doStart({ ...defaultOptions });

      expect(server.calls.map(call => call.requestUrl)).toEqual([
        `${TEST_BASE_URL}/video/`,
        `${TEST_BASE_URL}/video/${REQUEST_ID}/accept`,
        UPLOAD_URL,
        `${TEST_BASE_URL}/video/${REQUEST_ID}/complete-upload`,
      ]);
      expect(server.calls.map(call => call.requestMethod)).toEqual([
        'POST',
        'PATCH',
        'PUT',
        'PATCH',
      ]);
      expect(result.operation).toEqual({
        requestId: REQUEST_ID,
        outputContainer: 'mp4',
      });
      expect(result.warnings).toEqual([]);
    });

    it('maps the model id onto the Topaz filter model name', async () => {
      await createModel().doStart({ ...defaultOptions });

      const body = await server.calls[0].requestBodyJson;

      expect(body.filters).toEqual([{ model: 'slp-2.6' }]);
    });

    it('maps proteus onto its Topaz model name', async () => {
      await createModel('proteus').doStart({ ...defaultOptions });

      const body = await server.calls[0].requestBodyJson;

      expect(body.filters[0].model).toBe('prob-4');
    });

    it('forwards a raw Topaz model name unchanged', async () => {
      await createModel('slp-2.5').doStart({ ...defaultOptions });

      const body = await server.calls[0].requestBodyJson;

      expect(body.filters[0].model).toBe('slp-2.5');
    });

    it('derives the source size from the input bytes and the container from the media type', async () => {
      await createModel().doStart({ ...defaultOptions });

      const body = await server.calls[0].requestBodyJson;

      expect(body.source).toEqual({
        container: 'mp4',
        size: 8,
        duration: 10,
        frameCount: 300,
        frameRate: 30,
        resolution: { width: 1920, height: 1080 },
      });
    });

    it('reads source metadata from the spec call options when available', async () => {
      await createModel().doStart({
        ...defaultOptions,
        resolution: '1280x720',
        duration: 4,
        fps: 25,
        providerOptions: { topaz: {} },
      });

      const body = await server.calls[0].requestBodyJson;

      expect(body.source.resolution).toEqual({ width: 1280, height: 720 });
      expect(body.source.duration).toBe(4);
      expect(body.source.frameRate).toBe(25);
      // frameCount is derived from duration * frameRate.
      expect(body.source.frameCount).toBe(100);
    });

    it('prefers the source provider option over the spec call options', async () => {
      await createModel().doStart({
        ...defaultOptions,
        resolution: '1280x720',
        duration: 4,
        fps: 25,
      });

      const body = await server.calls[0].requestBodyJson;

      expect(body.source.resolution).toEqual({ width: 1920, height: 1080 });
      expect(body.source.duration).toBe(10);
    });

    it('defaults the output to the source, with AAC/Copy audio', async () => {
      await createModel().doStart({ ...defaultOptions });

      const body = await server.calls[0].requestBodyJson;

      expect(body.output).toEqual({
        resolution: { width: 1920, height: 1080 },
        frameRate: 30,
        audioCodec: 'AAC',
        audioTransfer: 'Copy',
        container: 'mp4',
      });
    });

    it('applies output provider options', async () => {
      await createModel().doStart({
        ...defaultOptions,
        providerOptions: {
          topaz: {
            ...sourceOptions,
            output: {
              width: 3840,
              height: 2160,
              frameRate: 60,
              audioCodec: 'PCM',
              audioTransfer: 'None',
              container: 'mov',
            },
          },
        },
      });

      const body = await server.calls[0].requestBodyJson;

      expect(body.output).toEqual({
        resolution: { width: 3840, height: 2160 },
        frameRate: 60,
        audioCodec: 'PCM',
        audioTransfer: 'None',
        container: 'mov',
      });
    });

    it('sends model settings as filter fields', async () => {
      await createModel().doStart({
        ...defaultOptions,
        providerOptions: {
          topaz: {
            ...sourceOptions,
            sharpness: 3.5,
            videoCodec: 'prores',
            watermark: false,
          },
        },
      });

      const body = await server.calls[0].requestBodyJson;

      expect(body.filters[0]).toEqual({
        model: 'slp-2.6',
        sharpness: 3.5,
        videoCodec: 'prores',
        watermark: false,
      });
    });

    it('lets the filter escape hatch override typed options', async () => {
      await createModel().doStart({
        ...defaultOptions,
        providerOptions: {
          topaz: {
            ...sourceOptions,
            sharpness: 3.5,
            filter: { sharpness: 1, experimentalSetting: 'on' },
          },
        },
      });

      const body = await server.calls[0].requestBodyJson;

      expect(body.filters[0]).toEqual({
        model: 'slp-2.6',
        sharpness: 1,
        experimentalSetting: 'on',
      });
    });

    it('appends additional filters', async () => {
      await createModel().doStart({
        ...defaultOptions,
        providerOptions: {
          topaz: {
            ...sourceOptions,
            additionalFilters: [{ model: 'apo-8', fps: 60 }],
          },
        },
      });

      const body = await server.calls[0].requestBodyJson;

      expect(body.filters).toEqual([
        { model: 'slp-2.6' },
        { model: 'apo-8', fps: 60 },
      ]);
    });

    it('uploads the bytes with the container content type and reports the eTag', async () => {
      await createModel().doStart({ ...defaultOptions });

      expect(server.calls[2].requestHeaders['content-type']).toBe('video/mp4');

      const completeBody = await server.calls[3].requestBodyJson;

      expect(completeBody).toEqual({
        uploadResults: [{ partNum: 1, eTag: 'etag-part-1' }],
      });
    });

    it('splits the upload across every returned URL', async () => {
      server.urls[`${TEST_BASE_URL}/video/${REQUEST_ID}/accept`].response = {
        type: 'json-value',
        body: { uploadId: 'upload-1', urls: [UPLOAD_URL, UPLOAD_URL_2] },
      };

      await createModel().doStart({ ...defaultOptions });

      const completeBody = await server.calls[4].requestBodyJson;

      expect(completeBody.uploadResults).toEqual([
        { partNum: 1, eTag: 'etag-part-1' },
        { partNum: 2, eTag: 'etag-part-2' },
      ]);
    });

    it('does not send the API key to the upload URL', async () => {
      await createModel().doStart({ ...defaultOptions });

      expect(server.calls[2].requestHeaders['x-api-key']).toBeUndefined();
    });

    it('sends the API key to the Topaz endpoints', async () => {
      await createModel().doStart({ ...defaultOptions });

      expect(server.calls[0].requestHeaders['x-api-key']).toBe('test-key');
      expect(server.calls[1].requestHeaders['x-api-key']).toBe('test-key');
    });

    it('warns about options Topaz does not support', async () => {
      const result = await createModel().doStart({
        ...defaultOptions,
        prompt: 'make it sharp',
        aspectRatio: '16:9',
        seed: 7,
        generateAudio: true,
        frameImages: [
          {
            type: 'url',
            url: 'https://example.com/first.png',
            role: 'first_frame',
          },
        ],
        n: 2,
      });

      expect(result.warnings.map(warning => warning.feature)).toEqual([
        'prompt',
        'aspectRatio',
        'seed',
        'generateAudio',
        'frameImages',
        'n',
      ]);
    });

    it('throws and names the missing metadata', async () => {
      await expect(
        createModel().doStart({
          ...defaultOptions,
          providerOptions: { topaz: {} },
        }),
      ).rejects.toThrow(
        /Missing: source\.width \/ source\.height .*source\.duration.*source\.frameRate.*source\.frameCount/s,
      );
    });

    it('throws when no video reference is passed', async () => {
      await expect(
        createModel().doStart({
          ...defaultOptions,
          inputReferences: undefined,
        }),
      ).rejects.toThrow(/require an input video/);
    });

    it('throws a targeted error when only a still image is passed', async () => {
      await expect(
        createModel().doStart({
          ...defaultOptions,
          inputReferences: undefined,
          image: { type: 'url', url: 'https://example.com/frame.png' },
        }),
      ).rejects.toThrow(/not a still image/);
    });

    it('throws for an unsupported container', async () => {
      await expect(
        createModel().doStart({
          ...defaultOptions,
          inputReferences: [
            { type: 'file', mediaType: 'video/webm', data: inputVideo.data },
          ],
        }),
      ).rejects.toThrow(/does not support the media type "video\/webm"/);
    });

    it('warns when more than one reference is passed', async () => {
      const result = await createModel().doStart({
        ...defaultOptions,
        inputReferences: [inputVideo, inputVideo],
      });

      expect(result.warnings).toContainEqual(
        expect.objectContaining({ feature: 'inputReferences' }),
      );
    });

    it('surfaces Topaz error details from the create call', async () => {
      server.urls[`${TEST_BASE_URL}/video/`].response = {
        type: 'error',
        status: 400,
        body: JSON.stringify({ detail: 'frameCount must be positive' }),
      };

      await expect(
        createModel().doStart({ ...defaultOptions }),
      ).rejects.toThrow(/frameCount must be positive/);
    });

    it('surfaces Topaz error details from the accept call', async () => {
      server.urls[`${TEST_BASE_URL}/video/${REQUEST_ID}/accept`].response = {
        type: 'error',
        status: 409,
        body: JSON.stringify({ detail: 'request already accepted' }),
      };

      await expect(
        createModel().doStart({ ...defaultOptions }),
      ).rejects.toThrow(/request already accepted/);
    });

    it('throws when no upload URLs are returned', async () => {
      server.urls[`${TEST_BASE_URL}/video/${REQUEST_ID}/accept`].response = {
        type: 'json-value',
        body: { uploadId: 'upload-1', urls: [] },
      };

      await expect(
        createModel().doStart({ ...defaultOptions }),
      ).rejects.toThrow(/no upload URLs/);
    });

    it('throws when the upload response has no ETag', async () => {
      server.urls[UPLOAD_URL].response = { type: 'json-value', body: {} };

      await expect(
        createModel().doStart({ ...defaultOptions }),
      ).rejects.toThrow(/did not return an ETag/);
    });
  });

  describe('doStatus', () => {
    const operation = { requestId: REQUEST_ID, outputContainer: 'mp4' };

    it('returns the download URL when the request completes', async () => {
      const result = await createModel().doStatus({ operation });

      expect(result.status).toBe('completed');
      expect(result).toMatchObject({
        videos: [{ type: 'url', url: DOWNLOAD_URL, mediaType: 'video/mp4' }],
      });
      expect(result.response.timestamp).toEqual(
        new Date('2026-01-01T00:00:00Z'),
      );
    });

    it('reports the media type of the output container', async () => {
      const result = await createModel().doStatus({
        operation: { requestId: REQUEST_ID, outputContainer: 'mov' },
      });

      expect(result).toMatchObject({
        videos: [expect.objectContaining({ mediaType: 'video/quicktime' })],
      });
    });

    it.each([
      'requested',
      'accepted',
      'initializing',
      'preprocessing',
      'processing',
      'postprocessing',
      'canceling',
    ])('reports %s as pending', async status => {
      server.urls[`${TEST_BASE_URL}/video/${REQUEST_ID}/status`].response = {
        type: 'json-value',
        body: { status },
      };

      const result = await createModel().doStatus({ operation });

      expect(result.status).toBe('pending');
    });

    it('reports a failed request as an error', async () => {
      server.urls[`${TEST_BASE_URL}/video/${REQUEST_ID}/status`].response = {
        type: 'json-value',
        body: { status: 'failed', message: 'out of credits' },
      };

      const result = await createModel().doStatus({ operation });

      expect(result.status).toBe('error');
      expect(result).toMatchObject({
        error: expect.stringMatching(/out of credits/),
      });
    });

    it('reports a canceled request as an error', async () => {
      server.urls[`${TEST_BASE_URL}/video/${REQUEST_ID}/status`].response = {
        type: 'json-value',
        body: { status: 'canceled' },
      };

      const result = await createModel().doStatus({ operation });

      expect(result.status).toBe('error');
    });

    it('throws when a completed request has no download URL', async () => {
      server.urls[`${TEST_BASE_URL}/video/${REQUEST_ID}/status`].response = {
        type: 'json-value',
        body: { status: 'complete' },
      };

      await expect(createModel().doStatus({ operation })).rejects.toThrow(
        /returned no download URL/,
      );
    });

    it('throws on an unrecognized status', async () => {
      server.urls[`${TEST_BASE_URL}/video/${REQUEST_ID}/status`].response = {
        type: 'json-value',
        body: { status: 'sideways' },
      };

      await expect(createModel().doStatus({ operation })).rejects.toThrow(
        /unrecognized status "sideways"/,
      );
    });
  });
});
