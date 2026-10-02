import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import { describe, it, expect, vi } from 'vitest';
import { MinimaxImageModel } from './minimax-image-model';
import type { MinimaxImageModelID } from './minimax-image-model-options';
import type { FetchFunction } from '@ai-sdk/provider-utils';

vi.mock('../../version', () => ({
  VERSION: '0.0.0-test',
}));

const TEST_BASE_URL = 'https://api.example.com';
const IMAGE_URL = `${TEST_BASE_URL}/v1/image_generation`;

const prompt = 'A beautiful sunset over the ocean';

const mockImageResponseWithURL = {
  data: {
    image_urls: ['https://cdn.example.com/image-001.jpg'],
  },
  metadata: {
    success_count: 1,
    failed_count: 0,
  },
  id: 'gen-123',
  base_resp: {
    status_msg: 'Success',
    status_code: 0,
  },
};

const mockImageResponseWithBase64 = {
  data: {
    image_base64: [
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    ],
  },
  metadata: {
    success_count: 1,
    failed_count: 0,
  },
  id: 'gen-456',
  base_resp: {
    status_msg: 'Success',
    status_code: 0,
  },
};

function createModel({
  baseURL = TEST_BASE_URL,
  fetch,
  modelId = 'image-01',
}: {
  baseURL?: string;
  fetch?: FetchFunction;
  modelId?: MinimaxImageModelID;
} = {}) {
  return new MinimaxImageModel(modelId, {
    provider: 'minimax.image',
    baseURL,
    headers: () => ({ Authorization: 'Bearer test-key' }),
    fetch,
  });
}

describe('MinimaxImageModel', () => {
  const server = createTestServer({
    [IMAGE_URL]: {
      response: { type: 'json-value', body: mockImageResponseWithURL },
    },
  });

  describe('constructor', () => {
    it('should expose correct provider and model information', () => {
      const model = createModel();

      expect(model.provider).toBe('minimax.image');
      expect(model.modelId).toBe('image-01');
      expect(model.specificationVersion).toBe('v4');
      expect(model.maxImagesPerCall).toBe(1);
    });
  });

  describe('doGenerate', () => {
    it('should pass the model and prompt', async () => {
      await createModel().doGenerate({
        prompt,
        n: 1,
        size: undefined,
        aspectRatio: undefined,
        seed: undefined,
        providerOptions: {},
        files: undefined,
        mask: undefined,
      });

      expect(await server.calls[0].requestBodyJson).toMatchObject({
        model: 'image-01',
        prompt,
        n: 1,
      });
    });

    it('should pass headers', async () => {
      const model = new MinimaxImageModel('image-01', {
        provider: 'minimax.image',
        baseURL: TEST_BASE_URL,
        headers: () => ({
          Authorization: 'Bearer test-key',
          'Custom-Provider-Header': 'provider-header-value',
        }),
      });

      await model.doGenerate({
        prompt,
        n: 1,
        size: undefined,
        aspectRatio: undefined,
        seed: undefined,
        providerOptions: {},
        headers: {
          'Custom-Request-Header': 'request-header-value',
        },
        files: undefined,
        mask: undefined,
      });

      expect(server.calls[0].requestHeaders).toMatchObject({
        authorization: 'Bearer test-key',
        'content-type': 'application/json',
        'custom-provider-header': 'provider-header-value',
        'custom-request-header': 'request-header-value',
      });
    });

    it('should pass aspect ratio', async () => {
      await createModel().doGenerate({
        prompt,
        n: 1,
        size: undefined,
        aspectRatio: '16:9',
        seed: undefined,
        providerOptions: {},
        files: undefined,
        mask: undefined,
      });

      expect(await server.calls[0].requestBodyJson).toMatchObject({
        aspect_ratio: '16:9',
      });
    });

    it('should pass size as width and height', async () => {
      await createModel().doGenerate({
        prompt,
        n: 1,
        size: '1024x1024',
        aspectRatio: undefined,
        seed: undefined,
        providerOptions: {},
        files: undefined,
        mask: undefined,
      });

      expect(await server.calls[0].requestBodyJson).toMatchObject({
        width: '1024x1024',
        height: '1024x1024',
      });
    });

    it('should pass seed', async () => {
      await createModel().doGenerate({
        prompt,
        n: 1,
        size: undefined,
        aspectRatio: undefined,
        seed: 12345,
        providerOptions: {},
        files: undefined,
        mask: undefined,
      });

      expect(await server.calls[0].requestBodyJson).toMatchObject({
        seed: 12345,
      });
    });

    it('should pass n', async () => {
      await createModel().doGenerate({
        prompt,
        n: 2,
        size: undefined,
        aspectRatio: undefined,
        seed: undefined,
        providerOptions: {},
        files: undefined,
        mask: undefined,
      });

      expect(await server.calls[0].requestBodyJson).toMatchObject({
        n: 2,
      });
    });

    it('should pass provider options for response format', async () => {
      await createModel().doGenerate({
        prompt,
        n: 1,
        size: undefined,
        aspectRatio: undefined,
        seed: undefined,
        providerOptions: {
          minimax: {
            response_format: 'base64',
          },
        },
        files: undefined,
        mask: undefined,
      });

      expect(await server.calls[0].requestBodyJson).toMatchObject({
        response_format: 'base64',
      });
    });

    it('should include response data with timestamp, modelId and headers', async () => {
      server.urls[IMAGE_URL].response = {
        type: 'json-value',
        body: mockImageResponseWithURL,
        headers: {
          'x-request-id': 'test-request-id',
          'x-ratelimit-remaining': '123',
        },
      };

      const result = await createModel().doGenerate({
        prompt,
        n: 1,
        size: undefined,
        aspectRatio: undefined,
        seed: undefined,
        files: undefined,
        mask: undefined,
        providerOptions: {},
      });

      expect(result.response).toMatchObject({
        modelId: 'image-01',
        headers: {
          'x-request-id': 'test-request-id',
          'x-ratelimit-remaining': '123',
        },
      });
      expect(result.response.timestamp).toBeInstanceOf(Date);
    });

    it('should include provider metadata with images', async () => {
      server.urls[IMAGE_URL].response = {
        type: 'json-value',
        body: mockImageResponseWithURL,
      };

      const result = await createModel().doGenerate({
        prompt,
        n: 1,
        size: undefined,
        aspectRatio: undefined,
        seed: undefined,
        files: undefined,
        mask: undefined,
        providerOptions: {},
      });

      expect(result.providerMetadata).toMatchObject({
        minimax: {
          images: ['https://cdn.example.com/image-001.jpg'],
        },
      });
    });

    it('should add warning for mask', async () => {
      const result = await createModel().doGenerate({
        prompt,
        n: 1,
        size: undefined,
        aspectRatio: undefined,
        seed: undefined,
        files: undefined,
        mask: {
          type: 'url',
          url: 'https://example.com/mask.png',
        },
        providerOptions: {},
      });

      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toMatchObject({
        type: 'unsupported',
        feature: 'mask',
        details: 'Masking is not supported by the Minimax image model.',
      });
    });

    it('should handle subject reference from files (URL)', async () => {
      await createModel().doGenerate({
        prompt,
        n: 1,
        size: undefined,
        aspectRatio: undefined,
        seed: undefined,
        mask: undefined,
        files: [
          {
            type: 'url',
            url: 'https://example.com/reference.jpg',
          },
        ],
        providerOptions: {},
      });

      expect(await server.calls[0].requestBodyJson).toMatchObject({
        subject_reference: [
          {
            type: 'character',
            image_file: 'https://example.com/reference.jpg',
          },
        ],
      });
    });

    it('should handle subject reference from files (base64)', async () => {
      await createModel().doGenerate({
        prompt,
        n: 1,
        size: undefined,
        aspectRatio: undefined,
        seed: undefined,
        mask: undefined,
        files: [
          {
            type: 'file',
            data: new Uint8Array([137, 80, 78, 71]),
            mediaType: 'image/png',
          },
        ],
        providerOptions: {},
      });

      const body = await server.calls[0].requestBodyJson;
      expect(body.subject_reference).toHaveLength(1);
      expect(body.subject_reference[0].type).toBe('character');
      expect(body.subject_reference[0].image_file).toMatch(
        /^data:image\/png;base64,/,
      );
    });

    it('should handle multiple subject references', async () => {
      await createModel().doGenerate({
        prompt,
        n: 1,
        size: undefined,
        aspectRatio: undefined,
        seed: undefined,
        mask: undefined,
        files: [
          {
            type: 'url',
            url: 'https://example.com/ref1.jpg',
          },
          {
            type: 'url',
            url: 'https://example.com/ref2.jpg',
          },
        ],
        providerOptions: {},
      });

      expect(await server.calls[0].requestBodyJson).toMatchObject({
        subject_reference: [
          {
            type: 'character',
            image_file: 'https://example.com/ref1.jpg',
          },
          {
            type: 'character',
            image_file: 'https://example.com/ref2.jpg',
          },
        ],
      });
    });

    it('should propagate abort signal', async () => {
      const controller = new AbortController();
      const abortError = new DOMException('Aborted', 'AbortError');

      const model = createModel({
        fetch: async (_url, init) => {
          controller.abort(abortError);
          init?.signal?.throwIfAborted();
          throw new Error('Expected abort');
        },
      });

      await expect(
        model.doGenerate({
          prompt,
          n: 1,
          size: undefined,
          aspectRatio: undefined,
          seed: undefined,
          abortSignal: controller.signal,
          files: undefined,
          mask: undefined,
          providerOptions: {},
        }),
      ).rejects.toBe(abortError);
    });

    it('should handle API errors', async () => {
      server.urls[IMAGE_URL].response = {
        type: 'error',
        status: 400,
        body: JSON.stringify({
          type: 'error',
          error: {
            type: 'invalid_request_error',
            message: 'Invalid request',
            http_code: 400,
          },
          request_id: 'req-err-001',
        }),
      };

      await expect(
        createModel().doGenerate({
          prompt,
          n: 1,
          size: undefined,
          aspectRatio: undefined,
          seed: undefined,
          files: undefined,
          mask: undefined,
          providerOptions: {},
        }),
      ).rejects.toMatchObject({
        name: 'AI_APICallError',
        statusCode: 400,
        message: 'Invalid request',
      });
    });
  });
});
