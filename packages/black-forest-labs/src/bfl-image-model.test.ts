import { FetchFunction } from '@ai-sdk/provider-utils';
import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import { describe, expect, it } from 'vitest';
import { BlackForestLabsImageModel } from './bfl-image-model';

const prompt = 'A cute baby sea otter';

function createBasicModel({
  headers,
  fetch,
  currentDate,
}: {
  headers?: () => Record<string, string>;
  fetch?: FetchFunction;
  currentDate?: () => Date;
} = {}) {
  return new BlackForestLabsImageModel('test-model', {
    provider: 'black-forest-labs.image',
    baseURL: 'https://api.example.com/v1',
    headers: headers ?? (() => ({ 'x-key': 'test-key' })),
    fetch,
    _internal: {
      currentDate,
    },
  });
}

describe('BlackForestLabsImageModel', () => {
  const server = createTestServer({
    'https://api.example.com/v1/test-model': {
      response: {
        type: 'json-value',
        body: {
          id: 'req-123',
          polling_url: 'https://api.example.com/poll',
        },
      },
    },
    'https://api.example.com/poll?id=req-123': {
      response: {
        type: 'json-value',
        body: {
          status: 'Ready',
          result: {
            sample: 'https://api.example.com/image.png',
          },
        },
      },
    },
    'https://api.example.com/image.png': {
      response: {
        type: 'binary',
        body: Buffer.from('test-binary-content'),
      },
    },
  });

  describe('doGenerate', () => {
    it('should pass the correct parameters including aspect ratio', async () => {
      const model = createBasicModel();

      await model.doGenerate({
        prompt,
        n: 1,
        size: undefined,
        aspectRatio: '16:9',
        seed: undefined,
        providerOptions: { bfl: { additional_param: 'value' } },
      });

      expect(await server.calls[0].requestBodyJson).toStrictEqual({
        prompt,
        aspect_ratio: '16:9',
        additional_param: 'value',
      });
    });

    it('should call the correct urls in sequence', async () => {
      const model = createBasicModel();

      await model.doGenerate({
        prompt,
        n: 1,
        aspectRatio: '16:9',
        providerOptions: {},
        size: undefined,
        seed: undefined,
      });

      expect(server.calls[0].requestMethod).toBe('POST');
      expect(server.calls[0].requestUrl).toBe(
        'https://api.example.com/v1/test-model',
      );
      expect(server.calls[1].requestMethod).toBe('GET');
      expect(server.calls[1].requestUrl).toBe(
        'https://api.example.com/poll?id=req-123',
      );
      expect(server.calls[2].requestMethod).toBe('GET');
      expect(server.calls[2].requestUrl).toBe(
        'https://api.example.com/image.png',
      );
    });

    it('should pass headers', async () => {
      const modelWithHeaders = createBasicModel({
        headers: () => ({
          'Custom-Provider-Header': 'provider-header-value',
          'x-key': 'test-key',
        }),
      });

      await modelWithHeaders.doGenerate({
        prompt,
        n: 1,
        providerOptions: {},
        headers: {
          'Custom-Request-Header': 'request-header-value',
        },
        size: undefined,
        seed: undefined,
        aspectRatio: undefined,
      });

      expect(server.calls[0].requestHeaders).toStrictEqual({
        'content-type': 'application/json',
        'custom-provider-header': 'provider-header-value',
        'custom-request-header': 'request-header-value',
        'x-key': 'test-key',
      });
    });

    it('should warn and derive aspect_ratio when size is provided', async () => {
      const model = createBasicModel();

      const result = await model.doGenerate({
        prompt,
        n: 1,
        size: '1024x1024',
        providerOptions: {},
        seed: undefined,
        aspectRatio: undefined,
      });

      expect(result.warnings).toContainEqual({
        type: 'unsupported-setting',
        setting: 'size',
        details:
          'Black Forest Labs does not accept width/height. Deriving aspect_ratio from size.',
      });
    });

    it('should warn and ignore size when both size and aspectRatio provided', async () => {
      const model = createBasicModel();

      const result = await model.doGenerate({
        prompt,
        n: 1,
        size: '1920x1080',
        providerOptions: {},
        seed: undefined,
        aspectRatio: '16:9',
      });

      expect(result.warnings).toContainEqual({
        type: 'unsupported-setting',
        setting: 'size',
        details: 'Black Forest Labs ignores size when aspectRatio is provided.',
      });
    });
  });
});
