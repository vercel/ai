import {
  type FetchFunction,
  WORKFLOW_DESERIALIZE,
  WORKFLOW_SERIALIZE,
} from '@ai-sdk/provider-utils';
import { APICallError, InvalidArgumentError } from '@ai-sdk/provider';
import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import { describe, expect, it } from 'vitest';
import { TopazVideoModel } from './topaz-video-model';

const TEST_BASE_URL = 'https://api.topazlabs.com';
const REQUEST_ID = 'req-abc-123';
const UPLOAD_URL = 'https://uploads.topazlabs.example.com/part-1';
const UPLOAD_URL_2 = 'https://uploads.topazlabs.example.com/part-2';
const DOWNLOAD_URL = 'https://cdn.topazlabs.example.com/out.mp4';
const SOURCE_URL = 'https://media.example.com/clips/input.mov';

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

const defaultOptions: Parameters<TopazVideoModel['doStart']>[0] = {
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
};

function createModel(modelId = 'starlight-precise-2.6', fetch?: FetchFunction) {
  return new TopazVideoModel(modelId, {
    provider: 'topaz.video',
    baseURL: TEST_BASE_URL,
    headers: () => ({ 'X-API-Key': 'test-key' }),
    fetch,
    _internal: { currentDate: () => new Date('2026-01-01T00:00:00Z') },
  });
}

/**
 * The test server does not expose raw request bodies, so upload bytes are
 * captured at the fetch boundary.
 */
function recordUploads(): { fetch: FetchFunction; uploads: Uint8Array[] } {
  const uploads: Uint8Array[] = [];
  const fetch: FetchFunction = (input, init) => {
    if (init?.method === 'PUT') {
      uploads.push(new Uint8Array(init.body as Uint8Array));
    }
    return globalThis.fetch(input, init);
  };
  return { fetch, uploads };
}

describe('TopazVideoModel', () => {
  const server = createTestServer({
    [`${TEST_BASE_URL}/video/`]: {
      response: {
        type: 'json-value',
        body: {
          requestId: REQUEST_ID,
          estimates: { cost: [12, 15], time: [60, 90] },
        },
      },
    },
    [`${TEST_BASE_URL}/video/express`]: {
      response: {
        type: 'json-value',
        body: {
          requestId: REQUEST_ID,
          uploadId: 'upload-express',
          uploadUrls: [UPLOAD_URL],
        },
      },
    },
    [`${TEST_BASE_URL}/video/${REQUEST_ID}`]: {
      response: { type: 'empty', status: 204 },
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
    [SOURCE_URL]: {
      response: { type: 'binary', body: Buffer.from(inputVideo.data) },
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
          outputSize: '12345',
          estimates: { cost: [14, 18], time: [60, 90] },
          download: {
            url: DOWNLOAD_URL,
            expiresIn: 3600,
            expiresAt: 1767229200000,
          },
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

    it('supports workflow serialization', () => {
      const serialized = TopazVideoModel[WORKFLOW_SERIALIZE](createModel());

      expect(serialized).toEqual({
        modelId: 'starlight-precise-2.6',
        config: {
          provider: 'topaz.video',
          baseURL: TEST_BASE_URL,
          headers: { 'X-API-Key': 'test-key' },
        },
      });

      const model = TopazVideoModel[WORKFLOW_DESERIALIZE]({
        modelId: 'starlight-precise-2.6',
        config: {
          provider: 'topaz.video',
          baseURL: TEST_BASE_URL,
          headers: { 'X-API-Key': 'test-key' },
        },
      });

      expect(model.provider).toBe('topaz.video');
      expect(model.modelId).toBe('starlight-precise-2.6');
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

    it('reports the initial cost estimate without a billed amount', async () => {
      const result = await createModel().doStart({ ...defaultOptions });

      expect(result.providerMetadata).toEqual({
        topaz: { requestId: REQUEST_ID, estimatedCredits: [12, 15] },
      });
    });

    it('sends the API key from a deserialized headers object', async () => {
      await TopazVideoModel[WORKFLOW_DESERIALIZE]({
        modelId: 'starlight-precise-2.6',
        config: {
          provider: 'topaz.video',
          baseURL: TEST_BASE_URL,
          headers: { 'X-API-Key': 'restored-key' },
        },
      }).doStart({ ...defaultOptions });

      expect(server.calls[0].requestHeaders['x-api-key']).toBe('restored-key');
      expect(server.calls[1].requestHeaders['x-api-key']).toBe('restored-key');
      expect(server.calls[2].requestHeaders['x-api-key']).toBeUndefined();
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

    it('derives frameCount from duration and frameRate', async () => {
      await createModel().doStart({
        ...defaultOptions,
        providerOptions: {
          topaz: {
            source: { width: 1280, height: 720, duration: 4, frameRate: 25 },
          },
        },
      });

      const body = await server.calls[0].requestBodyJson;

      expect(body.source.frameCount).toBe(100);
    });

    it('maps the resolution and fps call options onto the output', async () => {
      await createModel().doStart({
        ...defaultOptions,
        resolution: '3840x2160',
        fps: 60,
      });

      const body = await server.calls[0].requestBodyJson;

      expect(body.source.resolution).toEqual({ width: 1920, height: 1080 });
      expect(body.output.resolution).toEqual({ width: 3840, height: 2160 });
      expect(body.output.frameRate).toBe(60);
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

    it('splits the upload into segments of at least 500 MB, one per URL', async () => {
      server.urls[`${TEST_BASE_URL}/video/${REQUEST_ID}/accept`].response = {
        type: 'json-value',
        body: { uploadId: 'upload-1', urls: [UPLOAD_URL, UPLOAD_URL_2] },
      };

      const { fetch, uploads } = recordUploads();
      await createModel(undefined, fetch).doStart({ ...defaultOptions });

      // The 8-byte fixture fits in the first 500 MB segment.
      expect(uploads).toEqual([inputVideo.data, new Uint8Array()]);

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

    it('does not warn about an empty prompt', async () => {
      const result = await createModel().doStart({
        ...defaultOptions,
        prompt: '',
      });

      expect(result.warnings).toEqual([]);
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
            image: { type: 'url', url: 'https://example.com/first.png' },
            frameType: 'first_frame',
          },
        ],
        duration: 5,
        n: 2,
      });

      expect(
        result.warnings.map(warning =>
          warning.type === 'unsupported' ? warning.feature : warning.type,
        ),
      ).toEqual([
        'prompt',
        'aspectRatio',
        'seed',
        'duration',
        'generateAudio',
        'frameImages',
        'n',
      ]);
    });

    it('throws and names the missing metadata when source metadata is partial', async () => {
      await expect(
        createModel().doStart({
          ...defaultOptions,
          providerOptions: { topaz: { source: { width: 1920 } } },
        }),
      ).rejects.toThrow(
        /Missing: source\.height, source\.duration, source\.frameRate\./,
      );
      expect(server.calls).toHaveLength(0);
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
            { type: 'file', mediaType: 'video/ogg', data: inputVideo.data },
          ],
        }),
      ).rejects.toThrow(/Could not map the media type "video\/ogg"/);
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

    it('sends a placeholder ETag for a single-URL upload without one', async () => {
      server.urls[UPLOAD_URL].response = { type: 'json-value', body: {} };

      await createModel().doStart({ ...defaultOptions });

      expect(await server.calls[3].requestBodyJson).toEqual({
        uploadResults: [{ partNum: 1, eTag: 'unused' }],
      });
    });

    it('throws when a multi-part upload response has no ETag', async () => {
      server.urls[`${TEST_BASE_URL}/video/${REQUEST_ID}/accept`].response = {
        type: 'json-value',
        body: { uploadId: 'upload-1', urls: [UPLOAD_URL, UPLOAD_URL_2] },
      };
      server.urls[UPLOAD_URL].response = { type: 'json-value', body: {} };

      await expect(
        createModel().doStart({ ...defaultOptions }),
      ).rejects.toThrow(/did not return an ETag/);
    });

    it('downloads a URL input to size the full-flow request', async () => {
      await createModel().doStart({
        ...defaultOptions,
        inputReferences: [
          { type: 'url', url: SOURCE_URL, mediaType: 'video/quicktime' },
        ],
      });

      expect(
        server.calls.map(call => [call.requestMethod, call.requestUrl]),
      ).toEqual([
        ['GET', SOURCE_URL],
        ['POST', `${TEST_BASE_URL}/video/`],
        ['PATCH', `${TEST_BASE_URL}/video/${REQUEST_ID}/accept`],
        ['PUT', UPLOAD_URL],
        ['PATCH', `${TEST_BASE_URL}/video/${REQUEST_ID}/complete-upload`],
      ]);

      const body = await server.calls[1].requestBodyJson;
      expect(body.source.container).toBe('mov');
      expect(body.source.size).toBe(inputVideo.data.byteLength);
      expect(body.source).not.toHaveProperty('external');
      expect(server.calls[3].requestHeaders['content-type']).toBe(
        'video/quicktime',
      );
    });

    it('cancels the request when a step after create fails', async () => {
      server.urls[UPLOAD_URL].response = { type: 'error', status: 500 };

      await expect(
        createModel().doStart({ ...defaultOptions }),
      ).rejects.toThrow(/failed with status 500/);

      const cancel = server.calls.at(-1);
      expect(cancel?.requestMethod).toBe('DELETE');
      expect(cancel?.requestUrl).toBe(`${TEST_BASE_URL}/video/${REQUEST_ID}`);
      expect(cancel?.requestHeaders['x-api-key']).toBe('test-key');
    });

    it('includes the Topaz error code in API errors', async () => {
      server.urls[`${TEST_BASE_URL}/video/${REQUEST_ID}/accept`].response = {
        type: 'error',
        status: 402,
        body: JSON.stringify({
          message: 'Not enough credits',
          errorCode: 'INSUFFICIENT_CREDITS',
        }),
      };

      await expect(
        createModel().doStart({ ...defaultOptions }),
      ).rejects.toThrow('Not enough credits (INSUFFICIENT_CREDITS)');
    });

    it('reports the container Topaz forces for the chosen encoder', async () => {
      const result = await createModel().doStart({
        ...defaultOptions,
        providerOptions: {
          topaz: {
            ...sourceOptions,
            output: { videoEncoder: 'ProRes', container: 'mp4' },
          },
        },
      });

      expect(result.operation).toEqual({
        requestId: REQUEST_ID,
        outputContainer: 'mov',
      });
    });
  });

  describe('doStart (express)', () => {
    const expressOptions: Parameters<TopazVideoModel['doStart']>[0] = {
      ...defaultOptions,
      resolution: '3840x2160',
      providerOptions: { topaz: { sharpness: 3 } },
    };

    it('creates an express request and uploads to its URL', async () => {
      const { fetch, uploads } = recordUploads();
      const result = await createModel(undefined, fetch).doStart(
        expressOptions,
      );

      expect(
        server.calls.map(call => [call.requestMethod, call.requestUrl]),
      ).toEqual([
        ['POST', `${TEST_BASE_URL}/video/express`],
        ['PUT', UPLOAD_URL],
      ]);
      expect(await server.calls[0].requestBodyJson).toEqual({
        source: { container: 'mp4' },
        output: {
          resolution: { width: 3840, height: 2160 },
          audioTransfer: 'Copy',
          audioCodec: 'AAC',
          container: 'mp4',
        },
        filters: [{ model: 'slp-2.6', sharpness: 3 }],
      });
      expect(uploads).toEqual([inputVideo.data]);
      expect(result.operation).toEqual({
        requestId: REQUEST_ID,
        outputContainer: 'mp4',
      });
      expect(result.providerMetadata).toEqual({
        topaz: { requestId: REQUEST_ID },
      });
    });

    it('lets Topaz fetch a URL input instead of downloading and uploading it', async () => {
      server.urls[`${TEST_BASE_URL}/video/express`].response = {
        type: 'json-value',
        body: { requestId: REQUEST_ID },
      };

      const result = await createModel().doStart({
        ...expressOptions,
        inputReferences: [{ type: 'url', url: SOURCE_URL }],
      });

      expect(
        server.calls.map(call => [call.requestMethod, call.requestUrl]),
      ).toEqual([['POST', `${TEST_BASE_URL}/video/express`]]);
      expect((await server.calls[0].requestBodyJson).source).toEqual({
        // Detected from the URL extension.
        container: 'mov',
        external: { provider: 's3', presignedUrl: SOURCE_URL },
      });
      expect(result.operation).toEqual({
        requestId: REQUEST_ID,
        outputContainer: 'mov',
      });
    });

    it('uses the express flow when only the source container is declared', async () => {
      await createModel().doStart({
        ...expressOptions,
        providerOptions: { topaz: { source: { container: 'mov' } } },
      });

      expect(server.calls[0].requestUrl).toBe(`${TEST_BASE_URL}/video/express`);
      expect((await server.calls[0].requestBodyJson).source).toEqual({
        container: 'mov',
      });
    });

    it('omits the audio codec when audio is dropped', async () => {
      await createModel().doStart({
        ...expressOptions,
        providerOptions: { topaz: { output: { audioTransfer: 'None' } } },
      });

      const { output } = await server.calls[0].requestBodyJson;
      expect(output.audioTransfer).toBe('None');
      expect(output).not.toHaveProperty('audioCodec');
    });

    it('requires an output resolution', async () => {
      const error = await createModel()
        .doStart({ ...expressOptions, resolution: undefined })
        .catch(error => error);

      expect(InvalidArgumentError.isInstance(error)).toBe(true);
      expect(error.message).toMatch(/needs the output resolution/);
      expect(server.calls).toHaveLength(0);
    });

    it('reports an estimate when Topaz can compute one up front', async () => {
      server.urls[`${TEST_BASE_URL}/video/express`].response = {
        type: 'json-value',
        body: {
          requestId: REQUEST_ID,
          uploadUrls: [UPLOAD_URL],
          estimates: { cost: [3, 4] },
        },
      };

      const result = await createModel().doStart(expressOptions);

      expect(result.providerMetadata).toEqual({
        topaz: { requestId: REQUEST_ID, estimatedCredits: [3, 4] },
      });
    });

    it('cancels the request when the upload fails', async () => {
      server.urls[UPLOAD_URL].response = { type: 'error', status: 503 };

      const error = await createModel()
        .doStart(expressOptions)
        .catch(error => error);

      expect(APICallError.isInstance(error)).toBe(true);
      expect(error.statusCode).toBe(503);
      expect(error.isRetryable).toBe(true);
      expect(server.calls.at(-1)?.requestMethod).toBe('DELETE');
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

    it('bills the lower bound of the post-upload cost estimate', async () => {
      const result = await createModel().doStatus({ operation });

      expect(result.providerMetadata).toEqual({
        topaz: {
          requestId: REQUEST_ID,
          credits: 14,
          estimatedCredits: [14, 18],
          outputSize: '12345',
          expiresAt: 1767229200000,
        },
      });
    });

    it('uses the cheaper bound regardless of order', async () => {
      server.urls[`${TEST_BASE_URL}/video/${REQUEST_ID}/status`].response = {
        type: 'json-value',
        body: {
          status: 'complete',
          estimates: { cost: [20, 16] },
          download: { url: DOWNLOAD_URL },
        },
      };

      const result = await createModel().doStatus({ operation });

      expect(result.providerMetadata?.topaz.credits).toBe(16);
    });

    it('omits credits when Topaz returns no cost estimate', async () => {
      server.urls[`${TEST_BASE_URL}/video/${REQUEST_ID}/status`].response = {
        type: 'json-value',
        body: { status: 'complete', download: { url: DOWNLOAD_URL } },
      };

      const result = await createModel().doStatus({ operation });

      expect(result.providerMetadata).toEqual({
        topaz: { requestId: REQUEST_ID },
      });
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

    it('includes the Topaz error code on a failed request', async () => {
      server.urls[`${TEST_BASE_URL}/video/${REQUEST_ID}/status`].response = {
        type: 'json-value',
        body: {
          status: 'failed',
          errorCode: 'CREDIT_DIFFERENCE',
          message: 'Estimate changed after upload',
        },
      };

      const result = await createModel().doStatus({ operation });

      expect(result).toEqual({
        status: 'error',
        error:
          `Topaz video request ${REQUEST_ID} failed (CREDIT_DIFFERENCE): ` +
          'Estimate changed after upload',
        providerMetadata: {
          topaz: { requestId: REQUEST_ID, errorCode: 'CREDIT_DIFFERENCE' },
        },
        response: expect.any(Object),
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

    it('keeps polling on an unrecognized status', async () => {
      server.urls[`${TEST_BASE_URL}/video/${REQUEST_ID}/status`].response = {
        type: 'json-value',
        body: { status: 'sideways' },
      };

      const result = await createModel().doStatus({ operation });

      expect(result.status).toBe('pending');
    });
  });
});
