import type { FetchFunction } from '@ai-sdk/provider-utils';
import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import { describe, expect, it } from 'vitest';
import { MiniMaxImageModel } from './minimax-image-model';

const prompt = 'A cute baby sea otter';

const TEST_BASE_URL = 'https://api.example.com';
const GENERATE_URL = `${TEST_BASE_URL}/v1/image_generation`;

const IMAGE_URL = 'https://api.example.com/image-001.png';
const IMAGE_URL_2 = 'https://api.example.com/image-002.png';

const defaultOptions = {
  prompt,
  files: undefined,
  mask: undefined,
  n: 1,
  size: undefined,
  aspectRatio: undefined,
  seed: undefined,
  providerOptions: {},
} as const;

function createModel({
  currentDate,
  fetch,
}: {
  currentDate?: () => Date;
  fetch?: FetchFunction;
} = {}) {
  return new MiniMaxImageModel('image-01', {
    provider: 'minimax.image',
    baseURL: TEST_BASE_URL,
    headers: () => ({ Authorization: 'Bearer test-key' }),
    fetch,
    _internal: { currentDate },
  });
}

describe('MiniMaxImageModel', () => {
  describe('constructor', () => {
    it('should expose correct provider and model information', () => {
      const model = createModel();

      expect(model.provider).toBe('minimax.image');
      expect(model.modelId).toBe('image-01');
      expect(model.specificationVersion).toBe('v4');
      expect(model.maxImagesPerCall).toBe(9);
    });
  });

  describe('doGenerate (text-to-image)', () => {
    const server = createTestServer({
      [GENERATE_URL]: {
        response: {
          type: 'json-value',
          body: {
            data: { image_urls: [IMAGE_URL, IMAGE_URL_2] },
            metadata: { success_count: 2, failed_count: 0 },
            id: 'trace-001',
            base_resp: { status_code: 0, status_msg: 'success' },
          },
        },
      },
      [IMAGE_URL]: {
        response: { type: 'binary', body: Buffer.from('image-bytes-1') },
      },
      [IMAGE_URL_2]: {
        response: { type: 'binary', body: Buffer.from('image-bytes-2') },
      },
    });

    it('should send a text-to-image request with required fields', async () => {
      const model = createModel();

      await model.doGenerate({ ...defaultOptions });

      expect(server.calls[0].requestMethod).toBe('POST');
      expect(server.calls[0].requestUrl).toBe(GENERATE_URL);
      expect(await server.calls[0].requestBodyJson).toStrictEqual({
        model: 'image-01',
        prompt,
        n: 1,
        response_format: 'url',
      });
    });

    it('should use a bearer token for the request', async () => {
      const model = createModel();

      await model.doGenerate({ ...defaultOptions });

      expect(server.calls[0].requestHeaders).toMatchObject({
        authorization: 'Bearer test-key',
      });
    });

    it('should download and return URL-based images', async () => {
      const model = createModel();

      const result = await model.doGenerate({ ...defaultOptions });

      expect(result.images).toStrictEqual([
        new Uint8Array(Buffer.from('image-bytes-1')),
        new Uint8Array(Buffer.from('image-bytes-2')),
      ]);
      expect(result.providerMetadata?.minimax).toMatchObject({
        images: [{ url: IMAGE_URL }, { url: IMAGE_URL_2 }],
        traceId: 'trace-001',
        successCount: 2,
        failedCount: 0,
      });
    });

    it('should map size to width and height', async () => {
      const model = createModel();

      await model.doGenerate({
        ...defaultOptions,
        size: '1024x1024',
      });

      expect(await server.calls[0].requestBodyJson).toMatchObject({
        width: 1024,
        height: 1024,
      });
    });

    it('should map a supported aspect ratio', async () => {
      const model = createModel();

      await model.doGenerate({
        ...defaultOptions,
        aspectRatio: '16:9',
      });

      expect(await server.calls[0].requestBodyJson).toMatchObject({
        aspect_ratio: '16:9',
      });
    });

    it('should warn and ignore an unsupported aspect ratio', async () => {
      const model = createModel();

      const result = await model.doGenerate({
        ...defaultOptions,
        aspectRatio: '2:1',
      });

      expect(await server.calls[0].requestBodyJson).not.toHaveProperty(
        'aspect_ratio',
      );
      expect(result.warnings).toContainEqual({
        type: 'unsupported',
        feature: 'aspectRatio',
        details: expect.stringContaining('2:1'),
      });
    });

    it('should pass through the seed', async () => {
      const model = createModel();

      await model.doGenerate({
        ...defaultOptions,
        seed: 123,
      });

      expect(await server.calls[0].requestBodyJson).toMatchObject({
        seed: 123,
      });
    });

    it('should pass provider options promptOptimizer and responseFormat', async () => {
      const model = createModel();

      await model.doGenerate({
        ...defaultOptions,
        providerOptions: {
          minimax: { promptOptimizer: true, responseFormat: 'base64' },
        },
      });

      expect(await server.calls[0].requestBodyJson).toMatchObject({
        prompt_optimizer: true,
        response_format: 'base64',
      });
    });
  });

  describe('doGenerate (image-to-image)', () => {
    const server = createTestServer({
      [GENERATE_URL]: {
        response: {
          type: 'json-value',
          body: {
            data: { image_urls: [IMAGE_URL] },
            base_resp: { status_code: 0, status_msg: 'success' },
          },
        },
      },
      [IMAGE_URL]: {
        response: { type: 'binary', body: Buffer.from('image-bytes-1') },
      },
    });

    it('should map input files to subject references', async () => {
      const model = createModel();

      await model.doGenerate({
        ...defaultOptions,
        files: [
          {
            type: 'url',
            url: 'https://cdn.example.com/reference.png',
          },
        ],
      });

      expect(await server.calls[0].requestBodyJson).toMatchObject({
        subject_reference: [
          {
            type: 'character',
            image_file: 'https://cdn.example.com/reference.png',
          },
        ],
      });
    });

    it('should convert inline files to data URIs for subject references', async () => {
      const model = createModel();

      await model.doGenerate({
        ...defaultOptions,
        files: [
          {
            type: 'file',
            data: new Uint8Array(Buffer.from('file-bytes')),
            mediaType: 'image/png',
          },
        ],
      });

      const body = await server.calls[0].requestBodyJson;
      expect(body.subject_reference).toHaveLength(1);
      expect(body.subject_reference[0].type).toBe('character');
      expect(body.subject_reference[0].image_file).toMatch(
        /^data:image\/png;base64,/,
      );
    });

    it('should warn and ignore a mask image', async () => {
      const model = createModel();

      const result = await model.doGenerate({
        ...defaultOptions,
        mask: {
          type: 'file',
          data: new Uint8Array(Buffer.from('mask-bytes')),
          mediaType: 'image/png',
        },
      });

      expect(result.warnings).toContainEqual({
        type: 'unsupported',
        feature: 'mask',
        details: expect.any(String),
      });
    });
  });

  describe('doGenerate (base64 response)', () => {
    const server = createTestServer({
      [GENERATE_URL]: {
        response: {
          type: 'json-value',
          body: {
            data: {
              image_base64: ['aGVsbG8td29ybGQ=', 'c2Vjb25kLWltYWdl'],
            },
            base_resp: { status_code: 0, status_msg: 'success' },
          },
        },
      },
    });

    it('should return base64 strings directly', async () => {
      const model = createModel();

      const result = await model.doGenerate({
        ...defaultOptions,
        providerOptions: { minimax: { responseFormat: 'base64' } },
      });

      expect(result.images).toStrictEqual([
        'aGVsbG8td29ybGQ=',
        'c2Vjb25kLWltYWdl',
      ]);
      expect(result.providerMetadata?.minimax?.images).toStrictEqual([{}, {}]);
    });
  });

  describe('doGenerate (errors)', () => {
    const server = createTestServer({
      [GENERATE_URL]: {
        response: {
          type: 'json-value',
          body: {
            data: { image_urls: [] },
            base_resp: {
              status_code: 1008,
              status_msg: 'insufficient balance',
            },
          },
        },
      },
    });

    it('should throw when base_resp status code is non-zero', async () => {
      const model = createModel();

      await expect(model.doGenerate({ ...defaultOptions })).rejects.toThrow(
        /insufficient balance/,
      );
    });
  });

  describe('doGenerate (no images)', () => {
    const server = createTestServer({
      [GENERATE_URL]: {
        response: {
          type: 'json-value',
          body: {
            data: {},
            base_resp: { status_code: 0, status_msg: 'success' },
          },
        },
      },
    });

    it('should throw when no images are returned', async () => {
      const model = createModel();

      await expect(model.doGenerate({ ...defaultOptions })).rejects.toThrow(
        /returned no images/,
      );
    });
  });

  describe('doGenerate (response timestamp)', () => {
    const currentDate = new Date('2026-01-01T00:00:00Z');

    const server = createTestServer({
      [GENERATE_URL]: {
        response: {
          type: 'json-value',
          body: {
            data: { image_base64: ['aGVsbG8td29ybGQ='] },
            base_resp: { status_code: 0, status_msg: 'success' },
          },
        },
      },
    });

    it('should use the injected current date for the response timestamp', async () => {
      const model = createModel({
        currentDate: () => currentDate,
      });

      const result = await model.doGenerate({
        ...defaultOptions,
        providerOptions: { minimax: { responseFormat: 'base64' } },
      });

      expect(result.response.timestamp).toBe(currentDate);
      expect(result.response.modelId).toBe('image-01');
    });
  });
});
