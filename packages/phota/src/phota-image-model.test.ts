import { FetchFunction } from '@ai-sdk/provider-utils';
import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import { describe, expect, it } from 'vitest';
import { PhotaImageModel } from './phota-image-model';

const prompt = 'A cute baby sea otter';

function createBasicModel({
  modelId = 'generate' as string,
  headers,
  fetch,
  currentDate,
}: {
  modelId?: string;
  headers?: () => Record<string, string | undefined>;
  fetch?: FetchFunction;
  currentDate?: () => Date;
} = {}) {
  return new PhotaImageModel(modelId, {
    provider: 'phota.image',
    baseURL: 'https://api.example.com/v1/phota',
    headers: headers ?? (() => ({ 'X-API-Key': 'test-key' })),
    fetch,
    _internal: {
      currentDate,
    },
  });
}

describe('PhotaImageModel', () => {
  describe('generate', () => {
    const server = createTestServer({
      'https://api.example.com/v1/phota/generate': {
        response: {
          type: 'json-value',
          body: {
            images: ['dGVzdC1pbWFnZS0x', 'dGVzdC1pbWFnZS0y'],
            known_subjects: null,
          },
        },
      },
    });

    it('passes prompt and n as num_output_images', async () => {
      const model = createBasicModel();

      await model.doGenerate({
        prompt,
        files: undefined,
        mask: undefined,
        n: 2,
        size: undefined,
        aspectRatio: undefined,
        seed: undefined,
        providerOptions: {},
      });

      expect(await server.calls[0].requestBodyJson).toStrictEqual({
        prompt,
        num_output_images: 2,
      });
    });

    it('passes aspect ratio and provider options', async () => {
      const model = createBasicModel();

      await model.doGenerate({
        prompt,
        files: undefined,
        mask: undefined,
        n: 1,
        size: undefined,
        aspectRatio: '16:9',
        seed: undefined,
        providerOptions: {
          phota: {
            proMode: true,
            resolution: '4K',
          },
        },
      });

      expect(await server.calls[0].requestBodyJson).toStrictEqual({
        prompt,
        num_output_images: 1,
        aspect_ratio: '16:9',
        pro_mode: true,
        resolution: '4K',
      });
    });

    it('returns base64 images from the API response', async () => {
      const model = createBasicModel();

      const result = await model.doGenerate({
        prompt,
        files: undefined,
        mask: undefined,
        n: 2,
        size: undefined,
        aspectRatio: undefined,
        seed: undefined,
        providerOptions: {},
      });

      expect(result.images).toStrictEqual([
        'dGVzdC1pbWFnZS0x',
        'dGVzdC1pbWFnZS0y',
      ]);
    });

    it('warns when size is provided', async () => {
      const model = createBasicModel();

      const result = await model.doGenerate({
        prompt,
        files: undefined,
        mask: undefined,
        n: 1,
        size: '1024x1024',
        aspectRatio: undefined,
        seed: undefined,
        providerOptions: {},
      });

      expect(result.warnings).toStrictEqual([
        {
          type: 'unsupported',
          feature: 'size',
          details: 'Phota does not support size. Use aspectRatio instead.',
        },
      ]);
    });

    it('includes known_subjects in providerMetadata when present', async () => {
      server.urls['https://api.example.com/v1/phota/generate'].response = {
        type: 'json-value',
        body: {
          images: ['dGVzdA=='],
          known_subjects: {
            counts: { 'profile-abc': 1 },
          },
        },
      };

      const model = createBasicModel();

      const result = await model.doGenerate({
        prompt,
        files: undefined,
        mask: undefined,
        n: 1,
        size: undefined,
        aspectRatio: undefined,
        seed: undefined,
        providerOptions: {},
      });

      expect(result.providerMetadata?.phota).toMatchObject({
        images: [
          {
            knownSubjects: {
              counts: { 'profile-abc': 1 },
            },
          },
        ],
      });
    });

    it('includes timestamp, headers, and modelId in response metadata', async () => {
      const testDate = new Date('2025-01-01T00:00:00Z');
      const model = createBasicModel({ currentDate: () => testDate });

      const result = await model.doGenerate({
        prompt,
        files: undefined,
        mask: undefined,
        n: 1,
        size: undefined,
        aspectRatio: undefined,
        seed: undefined,
        providerOptions: {},
      });

      expect(result.response).toStrictEqual({
        timestamp: testDate,
        modelId: 'generate',
        headers: expect.any(Object),
      });
    });

    it('merges provider and request headers', async () => {
      const model = createBasicModel({
        headers: () => ({
          'X-API-Key': 'test-key',
          'Custom-Provider-Header': 'provider-value',
        }),
      });

      await model.doGenerate({
        prompt,
        files: undefined,
        mask: undefined,
        n: 1,
        size: undefined,
        aspectRatio: undefined,
        seed: undefined,
        providerOptions: {},
        headers: {
          'Custom-Request-Header': 'request-value',
        },
      });

      expect(server.calls[0].requestHeaders).toStrictEqual({
        'content-type': 'application/json',
        'x-api-key': 'test-key',
        'custom-provider-header': 'provider-value',
        'custom-request-header': 'request-value',
      });
    });
  });

  describe('edit', () => {
    const server = createTestServer({
      'https://api.example.com/v1/phota/edit': {
        response: {
          type: 'json-value',
          body: {
            images: ['ZWRpdGVkLWltYWdl'],
            known_subjects: null,
          },
        },
      },
    });

    it('passes images, prompt, and profile_ids', async () => {
      const model = createBasicModel({ modelId: 'edit' });

      await model.doGenerate({
        prompt: 'Make the sky blue',
        files: [{ type: 'url', url: 'https://example.com/photo.jpg' }],
        mask: undefined,
        n: 1,
        size: undefined,
        aspectRatio: undefined,
        seed: undefined,
        providerOptions: {
          phota: {
            profileIds: ['profile-123'],
          },
        },
      });

      expect(await server.calls[0].requestBodyJson).toStrictEqual({
        prompt: 'Make the sky blue',
        images: ['https://example.com/photo.jpg'],
        profile_ids: ['profile-123'],
        num_output_images: 1,
      });
    });

    it('passes aspect_ratio and resolution with pro_mode', async () => {
      const model = createBasicModel({ modelId: 'edit' });

      await model.doGenerate({
        prompt: 'Edit this',
        files: [{ type: 'url', url: 'https://example.com/photo.jpg' }],
        mask: undefined,
        n: 1,
        size: undefined,
        aspectRatio: '4:3',
        seed: undefined,
        providerOptions: {
          phota: {
            proMode: true,
            resolution: '4K',
          },
        },
      });

      expect(await server.calls[0].requestBodyJson).toStrictEqual({
        prompt: 'Edit this',
        images: ['https://example.com/photo.jpg'],
        pro_mode: true,
        num_output_images: 1,
        aspect_ratio: '4:3',
        resolution: '4K',
      });
    });
  });

  describe('enhance', () => {
    const server = createTestServer({
      'https://api.example.com/v1/phota/enhance': {
        response: {
          type: 'json-value',
          body: {
            images: ['ZW5oYW5jZWQ='],
            known_subjects: null,
          },
        },
      },
    });

    it('passes single image (not array) and omits prompt/aspect_ratio/resolution', async () => {
      const model = createBasicModel({ modelId: 'enhance' });

      await model.doGenerate({
        prompt: undefined,
        files: [{ type: 'url', url: 'https://example.com/photo.jpg' }],
        mask: undefined,
        n: 1,
        size: undefined,
        aspectRatio: undefined,
        seed: undefined,
        providerOptions: {
          phota: {
            profileIds: ['profile-123'],
          },
        },
      });

      expect(await server.calls[0].requestBodyJson).toStrictEqual({
        image: 'https://example.com/photo.jpg',
        profile_ids: ['profile-123'],
        num_output_images: 1,
      });
    });
  });

  describe('train', () => {
    const server = createTestServer({
      'https://api.example.com/v1/phota/profiles/add': {
        response: {
          type: 'json-value',
          body: {
            profile_id: 'trained-profile-abc',
          },
        },
      },
    });

    it('posts image URLs to profiles/add and returns profileId in metadata', async () => {
      const model = createBasicModel({ modelId: 'train' });

      const result = await model.doGenerate({
        prompt: undefined,
        files: [
          { type: 'url', url: 'https://example.com/photo1.jpg' },
          { type: 'url', url: 'https://example.com/photo2.jpg' },
          { type: 'url', url: 'https://example.com/photo3.jpg' },
        ],
        mask: undefined,
        n: 1,
        size: undefined,
        aspectRatio: undefined,
        seed: undefined,
        providerOptions: {},
      });

      expect(server.calls[0].requestUrl).toBe(
        'https://api.example.com/v1/phota/profiles/add',
      );
      expect(await server.calls[0].requestBodyJson).toStrictEqual({
        image_urls: [
          'https://example.com/photo1.jpg',
          'https://example.com/photo2.jpg',
          'https://example.com/photo3.jpg',
        ],
      });

      expect(result.providerMetadata?.phota).toMatchObject({
        images: [{ profileId: 'trained-profile-abc' }],
      });
      // Placeholder image returned so generateImage does not throw
      expect(result.images).toHaveLength(1);
    });

    it('throws when files contain non-URL data', async () => {
      const model = createBasicModel({ modelId: 'train' });

      await expect(
        model.doGenerate({
          prompt: undefined,
          files: [
            {
              type: 'file',
              data: 'base64data',
              mediaType: 'image/jpeg',
            },
          ],
          mask: undefined,
          n: 1,
          size: undefined,
          aspectRatio: undefined,
          seed: undefined,
          providerOptions: {},
        }),
      ).rejects.toThrow(
        'Phota profile training requires publicly accessible image URLs.',
      );
    });
  });

  describe('status', () => {
    const server = createTestServer({
      'https://api.example.com/v1/phota/profiles/my-profile-id/status': {
        response: {
          type: 'json-value',
          body: {
            profile_id: 'my-profile-id',
            status: 'READY',
            message: 'Training complete',
          },
        },
      },
    });

    it('polls profile status and returns it in metadata', async () => {
      const model = createBasicModel({ modelId: 'status' });

      const result = await model.doGenerate({
        prompt: undefined,
        files: undefined,
        mask: undefined,
        n: 1,
        size: undefined,
        aspectRatio: undefined,
        seed: undefined,
        providerOptions: {
          phota: {
            profileId: 'my-profile-id',
          },
        },
      });

      expect(server.calls[0].requestMethod).toBe('GET');
      expect(server.calls[0].requestUrl).toBe(
        'https://api.example.com/v1/phota/profiles/my-profile-id/status',
      );

      expect(result.providerMetadata?.phota).toMatchObject({
        images: [
          {
            profileId: 'my-profile-id',
            status: 'READY',
            message: 'Training complete',
          },
        ],
      });
      expect(result.images).toHaveLength(1);
    });

    it('throws when profileId is not provided', async () => {
      const model = createBasicModel({ modelId: 'status' });

      await expect(
        model.doGenerate({
          prompt: undefined,
          files: undefined,
          mask: undefined,
          n: 1,
          size: undefined,
          aspectRatio: undefined,
          seed: undefined,
          providerOptions: {},
        }),
      ).rejects.toThrow(
        'Phota status requires a profileId in providerOptions.phota.',
      );
    });
  });

  describe('error handling', () => {
    const server = createTestServer({
      'https://api.example.com/v1/phota/generate': {
        response: {
          type: 'error',
          status: 400,
          body: JSON.stringify({
            message: 'Content moderation violation',
            detail: 'CONTENT_MODERATION',
          }),
        },
      },
    });

    it('handles API errors with message and detail', async () => {
      const model = createBasicModel();

      await expect(
        model.doGenerate({
          prompt,
          files: undefined,
          mask: undefined,
          n: 1,
          size: undefined,
          aspectRatio: undefined,
          seed: undefined,
          providerOptions: {},
        }),
      ).rejects.toMatchObject({
        message: 'CONTENT_MODERATION',
        statusCode: 400,
        url: 'https://api.example.com/v1/phota/generate',
      });
    });
  });

  describe('constructor', () => {
    it('exposes correct provider and model information', () => {
      const model = createBasicModel();

      expect(model.provider).toBe('phota.image');
      expect(model.modelId).toBe('generate');
      expect(model.specificationVersion).toBe('v4');
      expect(model.maxImagesPerCall).toBe(1);
    });
  });
});
