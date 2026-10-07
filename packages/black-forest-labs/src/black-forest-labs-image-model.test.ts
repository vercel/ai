import type { FetchFunction } from '@ai-sdk/provider-utils';
import * as providerUtils from '@ai-sdk/provider-utils';
import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BlackForestLabsImageModel } from './black-forest-labs-image-model';
import type { BlackForestLabsImageModelId } from './black-forest-labs-image-settings';

vi.mock('@ai-sdk/provider-utils', async importOriginal => {
  const actual = await importOriginal<typeof providerUtils>();
  return {
    ...actual,
    parseProviderOptions: vi.fn(actual.parseProviderOptions),
  };
});

const prompt = 'A cute baby sea otter';

function createBasicModel({
  modelId = 'test-model',
  headers,
  fetch,
  currentDate,
  pollIntervalMillis,
  pollTimeoutMillis,
}: {
  modelId?: BlackForestLabsImageModelId;
  headers?: () => Record<string, string | undefined>;
  fetch?: FetchFunction;
  currentDate?: () => Date;
  pollIntervalMillis?: number;
  pollTimeoutMillis?: number;
} = {}) {
  return new BlackForestLabsImageModel(modelId, {
    provider: 'black-forest-labs.image',
    baseURL: 'https://api.example.com/v1',
    headers: headers ?? (() => ({ 'x-key': 'test-key' })),
    fetch,
    pollIntervalMillis,
    pollTimeoutMillis,
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
    'https://api.example.com/v1/flux-3-image': {
      response: {
        type: 'json-value',
        body: { id: 'req-123', polling_url: 'https://api.example.com/poll' },
      },
    },
    'https://api.example.com/v1/flux-pro-1.0-fill': {
      response: {
        type: 'json-value',
        body: {
          id: 'req-123',
          polling_url: 'https://api.example.com/poll',
        },
      },
    },
    'https://api.example.com/v1/flux-kontext-pro': {
      response: {
        type: 'json-value',
        body: {
          id: 'req-123',
          polling_url: 'https://api.example.com/poll',
        },
      },
    },
    'https://api.example.com/poll': {
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
    'https://cdn.evil.example/image.png': {
      response: {
        type: 'binary',
        body: Buffer.from('test-binary-content'),
      },
    },
    'https://api.bfl.ai/v1/test-model': {
      response: {
        type: 'json-value',
        body: {
          id: 'req-123',
          polling_url: 'https://api.us1.bfl.ai/v1/get_result',
        },
      },
    },
    'https://api.us1.bfl.ai/v1/get_result': {
      response: {
        type: 'json-value',
        body: {
          status: 'Ready',
          result: {
            sample: 'https://delivery-us1.bfl.ai/image.png',
          },
        },
      },
    },
    'https://delivery-us1.bfl.ai/image.png': {
      response: {
        type: 'binary',
        body: Buffer.from('test-binary-content'),
      },
    },
    'https://api.bfl.ai/image.png': {
      response: {
        type: 'binary',
        body: Buffer.from('test-binary-content'),
      },
    },
  });

  describe('capabilities', () => {
    it.each([
      {
        modelId: 'flux-3-image',
        supportsFileInputs: true,
        supportsMaskInputs: false,
      },
      {
        modelId: 'flux-pro-1.0-fill',
        supportsFileInputs: true,
        supportsMaskInputs: true,
      },
      {
        modelId: 'flux-kontext-pro',
        supportsFileInputs: true,
        supportsMaskInputs: false,
      },
      {
        modelId: 'flux-kontext-max',
        supportsFileInputs: true,
        supportsMaskInputs: false,
      },
      {
        modelId: 'flux-pro-1.1',
        supportsFileInputs: false,
        supportsMaskInputs: false,
      },
      {
        modelId: 'flux-pro-1.1-ultra',
        supportsFileInputs: false,
        supportsMaskInputs: false,
      },
      {
        modelId: 'custom-image-model',
        supportsFileInputs: undefined,
        supportsMaskInputs: undefined,
      },
    ] as const)(
      'advertises file=$supportsFileInputs and mask=$supportsMaskInputs for $modelId',
      ({ modelId, supportsFileInputs, supportsMaskInputs }) => {
        const model = createBasicModel({ modelId });

        expect(model.supportsFileInputs).toBe(supportsFileInputs);
        expect(model.supportsMaskInputs).toBe(supportsMaskInputs);
      },
    );
  });

  beforeEach(() => {
    vi.mocked(providerUtils.parseProviderOptions).mockClear();
  });

  describe('doGenerate', () => {
    it('parses provider options only once', async () => {
      const model = createBasicModel();

      await model.doGenerate({
        prompt,
        files: undefined,
        mask: undefined,
        n: 1,
        size: undefined,
        aspectRatio: '1:1',
        seed: undefined,
        providerOptions: {},
      });

      expect(providerUtils.parseProviderOptions).toHaveBeenCalledTimes(1);
    });

    it('passes the correct parameters including aspect ratio and providerOptions', async () => {
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
          blackForestLabs: {
            promptUpsampling: true,
            unsupportedProperty: 'value',
          },
        },
      });

      expect(await server.calls[0].requestBodyJson).toStrictEqual({
        prompt,
        aspect_ratio: '16:9',
        prompt_upsampling: true,
      });
    });

    it('uses image field for flux-pro-1.0-fill input images', async () => {
      const model = createBasicModel({ modelId: 'flux-pro-1.0-fill' });

      await model.doGenerate({
        prompt,
        files: [
          {
            type: 'file',
            mediaType: 'image/png',
            data: Buffer.from('test-image'),
          },
        ],
        mask: {
          type: 'file',
          mediaType: 'image/png',
          data: Buffer.from('test-mask'),
        },
        n: 1,
        size: undefined,
        aspectRatio: '1:1',
        seed: undefined,
        providerOptions: {},
      });

      expect(await server.calls[0].requestBodyJson).toStrictEqual({
        prompt,
        aspect_ratio: '1:1',
        image: Buffer.from('test-image').toString('base64'),
        mask: Buffer.from('test-mask').toString('base64'),
      });
    });

    it('uses input_image field for Kontext input images', async () => {
      const model = createBasicModel({ modelId: 'flux-kontext-pro' });

      await model.doGenerate({
        prompt,
        files: [
          {
            type: 'file',
            mediaType: 'image/png',
            data: Buffer.from('test-image'),
          },
        ],
        mask: undefined,
        n: 1,
        size: undefined,
        aspectRatio: '1:1',
        seed: undefined,
        providerOptions: {},
      });

      expect(await server.calls[0].requestBodyJson).toStrictEqual({
        prompt,
        aspect_ratio: '1:1',
        input_image: Buffer.from('test-image').toString('base64'),
      });
    });

    it('includes seed in providerMetadata images when provided by API', async () => {
      server.urls['https://api.example.com/poll'].response = {
        type: 'json-value',
        body: {
          status: 'Ready',
          result: {
            sample: 'https://api.example.com/image.png',
            seed: 12345,
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
        seed: undefined,
        aspectRatio: '1:1',
        providerOptions: {},
      });

      expect(result.providerMetadata?.blackForestLabs.images[0]).toMatchObject({
        seed: 12345,
      });
    });

    it('includes all cost and megapixel fields when provided by submit API', async () => {
      server.urls['https://api.example.com/v1/test-model'].response = {
        type: 'json-value',
        body: {
          id: 'req-123',
          polling_url: 'https://api.example.com/poll',
          cost: 0.08,
          input_mp: 1.5,
          output_mp: 2.0,
        },
      };

      const model = createBasicModel();
      const result = await model.doGenerate({
        prompt,
        files: undefined,
        mask: undefined,
        n: 1,
        size: undefined,
        seed: undefined,
        aspectRatio: '1:1',
        providerOptions: {},
      });

      expect(result.providerMetadata?.blackForestLabs.images[0]).toMatchObject({
        cost: 0.08,
        inputMegapixels: 1.5,
        outputMegapixels: 2.0,
      });
    });

    it('omits cost and megapixel fields from providerMetadata when not provided by submit API', async () => {
      server.urls['https://api.example.com/v1/test-model'].response = {
        type: 'json-value',
        body: {
          id: 'req-123',
          polling_url: 'https://api.example.com/poll',
        },
      };

      const model = createBasicModel();
      const result = await model.doGenerate({
        prompt,
        files: undefined,
        mask: undefined,
        n: 1,
        size: undefined,
        seed: undefined,
        aspectRatio: '1:1',
        providerOptions: {},
      });

      const metadata = result.providerMetadata?.blackForestLabs.images[0];
      expect(metadata).toBeDefined();
      expect(metadata).not.toHaveProperty('cost');
      expect(metadata).not.toHaveProperty('inputMegapixels');
      expect(metadata).not.toHaveProperty('outputMegapixels');
    });

    it('handles null cost and megapixel fields from submit API', async () => {
      server.urls['https://api.example.com/v1/test-model'].response = {
        type: 'json-value',
        body: {
          id: 'req-123',
          polling_url: 'https://api.example.com/poll',
          cost: null,
          input_mp: null,
          output_mp: null,
        },
      };

      const model = createBasicModel();
      const result = await model.doGenerate({
        prompt,
        files: undefined,
        mask: undefined,
        n: 1,
        size: undefined,
        seed: undefined,
        aspectRatio: '1:1',
        providerOptions: {},
      });

      const metadata = result.providerMetadata?.blackForestLabs.images[0];
      expect(metadata).toBeDefined();
      expect(metadata).not.toHaveProperty('cost');
      expect(metadata).not.toHaveProperty('inputMegapixels');
      expect(metadata).not.toHaveProperty('outputMegapixels');
    });

    it('calls the expected URLs in sequence', async () => {
      const model = createBasicModel();

      await model.doGenerate({
        prompt,
        files: undefined,
        mask: undefined,
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

    it('does not send the API key when the result URL is on a foreign origin', async () => {
      server.urls['https://api.example.com/poll'].response = {
        type: 'json-value',
        body: {
          status: 'Ready',
          result: { sample: 'https://cdn.evil.example/image.png' },
        },
      };

      const model = createBasicModel();
      await model.doGenerate({
        prompt,
        files: undefined,
        mask: undefined,
        n: 1,
        size: undefined,
        aspectRatio: undefined,
        seed: undefined,
        providerOptions: {},
      });

      const downloadCall = server.calls.find(
        call => call.requestUrl === 'https://cdn.evil.example/image.png',
      );
      expect(downloadCall).toBeDefined();
      expect(downloadCall!.requestHeaders['x-key']).toBeUndefined();
    });

    it('sends the API key when the polling URL is on a sibling bfl.ai cluster host', async () => {
      const model = new BlackForestLabsImageModel('test-model', {
        provider: 'black-forest-labs.image',
        baseURL: 'https://api.bfl.ai/v1',
        headers: () => ({ 'x-key': 'test-key' }),
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
      });

      const pollCall = server.calls.find(call =>
        call.requestUrl.startsWith('https://api.us1.bfl.ai/v1/get_result'),
      );
      expect(pollCall).toBeDefined();
      expect(pollCall!.requestHeaders['x-key']).toBe('test-key');
    });

    it('does not send credentials to signed image URLs on a BFL delivery host', async () => {
      const model = new BlackForestLabsImageModel('test-model', {
        provider: 'black-forest-labs.image',
        baseURL: 'https://api.bfl.ai/v1',
        headers: () => ({
          'x-key': 'test-key',
          authorization: 'Bearer test-token',
        }),
      });
      await model.doGenerate({
        prompt,
        n: 1,
        files: undefined,
        mask: undefined,
        size: undefined,
        aspectRatio: undefined,
        seed: undefined,
        providerOptions: {},
      });
      const downloadCall = server.calls.find(
        call => call.requestUrl === 'https://delivery-us1.bfl.ai/image.png',
      );
      expect(downloadCall).toBeDefined();
      expect(downloadCall?.requestHeaders['x-key']).toBeUndefined();
      expect(downloadCall?.requestHeaders.authorization).toBeUndefined();
    });

    it.each(['test-model', 'flux-3-image'])(
      'preserves headers for same-origin custom proxy downloads with %s',
      async modelId => {
        await createBasicModel({
          modelId,
          headers: () => ({
            'x-key': 'test-key',
            authorization: 'Bearer test-token',
            'custom-provider-header': 'provider-value',
          }),
        }).doGenerate({
          prompt,
          n: 1,
          files: undefined,
          mask: undefined,
          size: undefined,
          aspectRatio: undefined,
          seed: undefined,
          providerOptions: {},
          headers: { 'custom-request-header': 'request-value' },
        });

        expect(server.calls[2].requestHeaders).toEqual({
          'x-key': 'test-key',
          authorization: 'Bearer test-token',
          'custom-provider-header': 'provider-value',
          'custom-request-header': 'request-value',
        });
      },
    );

    it('does not send credentials to signed image URLs on the configured BFL origin', async () => {
      server.urls['https://api.us1.bfl.ai/v1/get_result'].response = {
        type: 'json-value',
        body: {
          status: 'Ready',
          result: { sample: 'https://api.bfl.ai/image.png' },
        },
      };
      await new BlackForestLabsImageModel('test-model', {
        provider: 'black-forest-labs.image',
        baseURL: 'https://api.bfl.ai/v1',
        headers: () => ({
          'x-key': 'test-key',
          authorization: 'Bearer test-token',
        }),
      }).doGenerate({
        prompt,
        n: 1,
        files: undefined,
        mask: undefined,
        size: undefined,
        aspectRatio: undefined,
        seed: undefined,
        providerOptions: {},
      });

      expect(server.calls[2].requestHeaders['x-key']).toBeUndefined();
      expect(server.calls[2].requestHeaders.authorization).toBeUndefined();
    });

    it('merges provider and request headers for submit call', async () => {
      const modelWithHeaders = createBasicModel({
        headers: () => ({
          'Custom-Provider-Header': 'provider-header-value',
          'x-key': 'test-key',
        }),
      });

      await modelWithHeaders.doGenerate({
        prompt,
        files: undefined,
        mask: undefined,
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

    it('passes merged headers to polling requests', async () => {
      const modelWithHeaders = createBasicModel({
        headers: () => ({
          'Custom-Provider-Header': 'provider-header-value',
          'x-key': 'test-key',
        }),
      });

      await modelWithHeaders.doGenerate({
        prompt,
        files: undefined,
        mask: undefined,
        n: 1,
        providerOptions: {},
        headers: {
          'Custom-Request-Header': 'request-header-value',
        },
        size: undefined,
        seed: undefined,
        aspectRatio: undefined,
      });

      expect(server.calls[1].requestHeaders).toStrictEqual({
        'custom-provider-header': 'provider-header-value',
        'custom-request-header': 'request-header-value',
        'x-key': 'test-key',
      });
    });

    it('warns and derives aspect_ratio when size is provided', async () => {
      const model = createBasicModel();

      const result = await model.doGenerate({
        prompt,
        files: undefined,
        mask: undefined,
        n: 1,
        size: '1024x1024',
        providerOptions: {},
        seed: undefined,
        aspectRatio: undefined,
      });

      expect(result.warnings).toMatchInlineSnapshot(`
        [
          {
            "details": "Deriving aspect_ratio from size. Use the width and height provider options to specify dimensions for models that support them.",
            "feature": "size",
            "type": "unsupported",
          },
        ]
      `);
    });

    it('warns and ignores size when both size and aspectRatio are provided', async () => {
      const model = createBasicModel();

      const result = await model.doGenerate({
        prompt,
        files: undefined,
        mask: undefined,
        n: 1,
        size: '1920x1080',
        providerOptions: {},
        seed: undefined,
        aspectRatio: '16:9',
      });

      expect(result.warnings).toMatchInlineSnapshot(`
        [
          {
            "details": "Black Forest Labs ignores size when aspectRatio is provided. Use the width and height provider options to specify dimensions for models that support them",
            "feature": "size",
            "type": "unsupported",
          },
        ]
      `);
    });

    it('handles API errors with message and detail', async () => {
      server.urls['https://api.example.com/v1/test-model'].response = {
        type: 'error',
        status: 400,
        body: JSON.stringify({
          message: 'Top-level message',
          detail: { error: 'Invalid prompt' },
        }),
      };

      const model = createBasicModel();

      await expect(
        model.doGenerate({
          prompt,
          files: undefined,
          mask: undefined,
          n: 1,
          providerOptions: {},
          size: undefined,
          seed: undefined,
          aspectRatio: undefined,
        }),
      ).rejects.toMatchObject({
        message: '{"error":"Invalid prompt"}',
        statusCode: 400,
        url: 'https://api.example.com/v1/test-model',
      });
    });

    it('handles poll responses with state instead of status', async () => {
      server.urls['https://api.example.com/poll'].response = {
        type: 'json-value',
        body: {
          state: 'Ready',
          result: {
            sample: 'https://api.example.com/image.png',
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
        seed: undefined,
        aspectRatio: '1:1',
        providerOptions: {},
      });

      expect(result.images).toHaveLength(1);
      expect(result.images[0]).toBeInstanceOf(Uint8Array);
    });

    it('polls multiple times using configured interval until Ready', async () => {
      let pollHitCount = 0;
      server.urls['https://api.example.com/poll'].response = () => {
        pollHitCount += 1;
        if (pollHitCount < 3) {
          return {
            type: 'json-value',
            body: { status: 'Pending' },
          };
        }
        return {
          type: 'json-value',
          body: {
            status: 'Ready',
            result: { sample: 'https://api.example.com/image.png' },
          },
        };
      };

      const model = createBasicModel({
        pollIntervalMillis: 10,
        pollTimeoutMillis: 1000,
      });

      await model.doGenerate({
        prompt,
        files: undefined,
        mask: undefined,
        n: 1,
        size: undefined,
        seed: undefined,
        aspectRatio: '1:1',
        providerOptions: {},
      });

      const pollCalls = server.calls.filter(
        c =>
          c.requestMethod === 'GET' &&
          c.requestUrl.startsWith('https://api.example.com/poll'),
      );
      expect(pollCalls.length).toBe(3);
    });

    it('enforces pollTimeoutMillis while a polling request is pending', async () => {
      let pollingSignal: AbortSignal | null | undefined;
      const fetch: FetchFunction = async (input, init) => {
        const url = input instanceof Request ? input.url : input.toString();

        if (url === 'https://api.example.com/v1/test-model') {
          return new Response(
            JSON.stringify({
              id: 'req-123',
              polling_url: 'https://api.example.com/poll',
            }),
            {
              status: 200,
              headers: { 'content-type': 'application/json' },
            },
          );
        }

        pollingSignal = init?.signal;
        return new Promise<Response>((_resolve, reject) => {
          pollingSignal?.addEventListener(
            'abort',
            () => reject(pollingSignal?.reason),
            { once: true },
          );
        });
      };

      const model = createBasicModel({
        fetch,
        pollIntervalMillis: 10,
        pollTimeoutMillis: 25,
      });

      await expect(
        model.doGenerate({
          prompt,
          files: undefined,
          mask: undefined,
          n: 1,
          size: undefined,
          seed: undefined,
          aspectRatio: '1:1',
          providerOptions: {},
        }),
      ).rejects.toThrow('Black Forest Labs generation timed out.');

      expect(pollingSignal?.aborted).toBe(true);
    });

    it('throws when poll is Ready but sample is missing', async () => {
      server.urls['https://api.example.com/poll'].response = {
        type: 'json-value',
        body: {
          status: 'Ready',
          result: null,
        },
      };

      const model = createBasicModel();

      await expect(
        model.doGenerate({
          prompt,
          files: undefined,
          mask: undefined,
          n: 1,
          size: undefined,
          seed: undefined,
          aspectRatio: '1:1',
          providerOptions: {},
        }),
      ).rejects.toThrow(
        'Black Forest Labs poll response is Ready but missing result.sample',
      );
    });

    it('throws when poll returns Error or Failed', async () => {
      server.urls['https://api.example.com/poll'].response = {
        type: 'json-value',
        body: {
          status: 'Error',
        },
      };

      const model = createBasicModel();

      await expect(
        model.doGenerate({
          prompt,
          files: undefined,
          mask: undefined,
          n: 1,
          size: undefined,
          seed: undefined,
          aspectRatio: '1:1',
          providerOptions: {},
        }),
      ).rejects.toThrow('Black Forest Labs generation failed.');
    });

    it('includes timestamp, headers, and modelId in response metadata', async () => {
      const testDate = new Date('2025-01-01T00:00:00Z');
      const model = createBasicModel({
        currentDate: () => testDate,
      });

      const result = await model.doGenerate({
        prompt,
        files: undefined,
        mask: undefined,
        n: 1,
        providerOptions: {},
        size: undefined,
        seed: undefined,
        aspectRatio: '1:1',
      });

      expect(result.response).toStrictEqual({
        timestamp: testDate,
        modelId: 'test-model',
        headers: expect.any(Object),
      });
    });
  });

  describe('FLUX 3', () => {
    const callOptions: Parameters<BlackForestLabsImageModel['doGenerate']>[0] =
      {
        prompt,
        n: 1,
        files: undefined,
        mask: undefined,
        size: undefined,
        aspectRatio: undefined,
        seed: undefined,
        providerOptions: {},
      };

    it('leaves aspect ratio and resolution defaults to the endpoint', async () => {
      const result = await createBasicModel({
        modelId: 'flux-3-image',
      }).doGenerate(callOptions);
      expect(await server.calls[0].requestBodyJson).toEqual({ prompt });
      expect(result.warnings).toEqual([]);
    });

    it.each(['768sq', '1k', '1.5k', '2k', '4k'])(
      'sends resolution %s and FLUX 3 provider options',
      async resolution => {
        await createBasicModel({ modelId: 'flux-3-image' }).doGenerate({
          ...callOptions,
          aspectRatio: '16:9',
          providerOptions: {
            blackForestLabs: {
              resolution,
              grounding: false,
              safetyTolerance: 4,
              version: 'latest',
            },
          },
        });
        expect(await server.calls[0].requestBodyJson).toEqual({
          prompt,
          aspect_ratio: '16:9',
          resolution,
          grounding: false,
          safety_tolerance: 4,
          version: 'latest',
        });
      },
    );

    it('sends URL and base64 reference images in the images array', async () => {
      await createBasicModel({ modelId: 'flux-3-image' }).doGenerate({
        ...callOptions,
        files: [
          { type: 'url', url: 'https://example.com/reference.png' },
          {
            type: 'file',
            data: new Uint8Array([1, 2, 3]),
            mediaType: 'image/png',
          },
          { type: 'file', data: 'dGVzdA==', mediaType: 'image/png' },
        ],
      });
      expect(await server.calls[0].requestBodyJson).toEqual({
        prompt,
        images: ['https://example.com/reference.png', 'AQID', 'dGVzdA=='],
      });
    });

    it('derives aspect ratio from size without sending dimensions or seed', async () => {
      const result = await createBasicModel({
        modelId: 'flux-3-image',
      }).doGenerate({
        ...callOptions,
        size: '1536x1024',
        seed: 42,
      });
      expect(await server.calls[0].requestBodyJson).toEqual({
        prompt,
        aspect_ratio: '3:2',
      });
      expect(result.warnings).toEqual([
        expect.objectContaining({ type: 'unsupported', feature: 'size' }),
        { type: 'unsupported', feature: 'seed' },
      ]);
    });

    it('prefers an explicit aspect ratio over size', async () => {
      await createBasicModel({ modelId: 'flux-3-image' }).doGenerate({
        ...callOptions,
        size: '1024x1024',
        aspectRatio: '16:9',
      });
      expect(await server.calls[0].requestBodyJson).toEqual({
        prompt,
        aspect_ratio: '16:9',
      });
    });

    it.each([
      { size: '1792x1024', ratio: '7:4' },
      { size: '1536x640', ratio: '12:5' },
    ] as const)(
      'omits unsupported aspect ratio $ratio derived from $size',
      async ({ size, ratio }) => {
        const result = await createBasicModel({
          modelId: 'flux-3-image',
        }).doGenerate({ ...callOptions, size });

        expect(await server.calls[0].requestBodyJson).toEqual({ prompt });
        expect(result.warnings).toContainEqual({
          type: 'unsupported',
          feature: 'aspectRatio',
          details: `FLUX 3 does not support aspect ratio ${ratio}. Using the endpoint's default auto aspect ratio.`,
        });
      },
    );

    it('omits unsupported explicit aspect ratios even when size has a supported ratio', async () => {
      const result = await createBasicModel({
        modelId: 'flux-3-image',
      }).doGenerate({
        ...callOptions,
        size: '1536x1024',
        aspectRatio: '3:1',
      });

      expect(await server.calls[0].requestBodyJson).toEqual({ prompt });
      expect(result.warnings).toContainEqual({
        type: 'unsupported',
        feature: 'aspectRatio',
        details:
          "FLUX 3 does not support aspect ratio 3:1. Using the endpoint's default auto aspect ratio.",
      });
    });

    it.each([
      { size: '2520x1080', ratio: '21:9' },
      { size: '1080x2520', ratio: '9:21' },
    ] as const)(
      'uses the accepted aspect ratio $ratio for $size',
      async ({ size, ratio }) => {
        await createBasicModel({ modelId: 'flux-3-image' }).doGenerate({
          ...callOptions,
          size,
        });

        expect(await server.calls[0].requestBodyJson).toEqual({
          prompt,
          aspect_ratio: ratio,
        });
      },
    );

    it.each([
      '21:9',
      '2:1',
      '16:9',
      '3:2',
      '7:5',
      '4:3',
      '5:4',
      '1:1',
      '4:5',
      '3:4',
      '5:7',
      '2:3',
      '9:16',
      '1:2',
      '9:21',
    ] as const)('passes the supported aspect ratio %s', async aspectRatio => {
      const result = await createBasicModel({
        modelId: 'flux-3-image',
      }).doGenerate({ ...callOptions, aspectRatio });

      expect(await server.calls[0].requestBodyJson).toEqual({
        prompt,
        aspect_ratio: aspectRatio,
      });
      expect(result.warnings).toEqual([]);
    });

    it('omits legacy endpoint fields and warns about unsupported options', async () => {
      const result = await createBasicModel({
        modelId: 'flux-3-image',
      }).doGenerate({
        ...callOptions,
        providerOptions: {
          blackForestLabs: {
            width: 1024,
            height: 1024,
            outputFormat: 'png',
            steps: 20,
            guidance: 4,
            promptUpsampling: true,
            raw: false,
            imagePrompt: 'dGVzdA==',
            imagePromptStrength: 0.5,
            inputImage: 'dGVzdA==',
            webhookUrl: 'https://example.com/webhook',
            webhookSecret: 'secret',
          },
        },
      });
      expect(await server.calls[0].requestBodyJson).toEqual({ prompt });
      expect(result.warnings).toHaveLength(12);
      expect(result.warnings).toEqual(
        expect.arrayContaining([
          { type: 'unsupported', feature: 'blackForestLabs.width' },
          { type: 'unsupported', feature: 'blackForestLabs.raw' },
          { type: 'unsupported', feature: 'blackForestLabs.inputImage' },
        ]),
      );
    });

    it.each([
      { safetyTolerance: 5 },
      { safetyTolerance: -1 },
      { safetyTolerance: 1.5 },
      { resolution: '8k' },
      { version: 'unknown' },
    ])(
      'rejects invalid provider options %j before submission',
      async blackForestLabs => {
        await expect(
          createBasicModel({ modelId: 'flux-3-image' }).doGenerate({
            ...callOptions,
            providerOptions: { blackForestLabs },
          }),
        ).rejects.toThrow();
        expect(server.calls).toHaveLength(0);
      },
    );

    it('preserves the legacy safety tolerance range', async () => {
      await createBasicModel().doGenerate({
        ...callOptions,
        providerOptions: { blackForestLabs: { safetyTolerance: 6 } },
      });
      expect(await server.calls[0].requestBodyJson).toEqual({
        prompt,
        safety_tolerance: 6,
      });
    });

    it('rejects masks before submission', async () => {
      await expect(
        createBasicModel({ modelId: 'flux-3-image' }).doGenerate({
          ...callOptions,
          mask: { type: 'url', url: 'https://example.com/mask.png' },
        }),
      ).rejects.toThrow('FLUX 3 image masks');
      expect(server.calls).toHaveLength(0);
    });

    it('rejects more than ten reference images before submission', async () => {
      await expect(
        createBasicModel({ modelId: 'flux-3-image' }).doGenerate({
          ...callOptions,
          files: Array.from({ length: 11 }, () => ({
            type: 'url' as const,
            url: 'https://example.com/image.png',
          })),
        }),
      ).rejects.toThrow('Black Forest Labs supports up to 10 input images.');
      expect(server.calls).toHaveLength(0);
    });

    it('polls through Pending, Reasoning, and Generating until Ready', async () => {
      const statuses = ['Pending', 'Reasoning', 'Generating', 'Ready'];
      let pollCount = 0;
      server.urls['https://api.example.com/poll'].response = () => {
        const status = statuses[pollCount++];
        return {
          type: 'json-value',
          body: {
            status,
            ...(status === 'Ready'
              ? {
                  result: {
                    sample: 'https://api.example.com/image.png',
                    duration: 2,
                  },
                }
              : {}),
          },
        };
      };
      const result = await createBasicModel({
        modelId: 'flux-3-image',
        pollIntervalMillis: 1,
      }).doGenerate(callOptions);
      expect(pollCount).toBe(4);
      expect(result.images).toHaveLength(1);
      expect(result.providerMetadata?.blackForestLabs.images[0]).toMatchObject({
        duration: 2,
      });
    });

    it.each(['Request Moderated', 'Content Moderated', 'Task not found'])(
      'stops polling on %s',
      async status => {
        server.urls['https://api.example.com/poll'].response = {
          type: 'json-value',
          body: { status },
        };
        await expect(
          createBasicModel({ modelId: 'flux-3-image' }).doGenerate(callOptions),
        ).rejects.toThrow(`Black Forest Labs generation failed: ${status}.`);
        expect(server.calls).toHaveLength(2);
      },
    );

    it.each(['status', 'state'])(
      'treats HTTP 503 with a terminal %s as non-retryable',
      async field => {
        server.urls['https://api.example.com/poll'].response = {
          type: 'error',
          status: 503,
          body: JSON.stringify({ [field]: 'Error' }),
        };
        await expect(
          createBasicModel({ modelId: 'flux-3-image' }).doGenerate(callOptions),
        ).rejects.toMatchObject({
          statusCode: 503,
          isRetryable: false,
          message: 'Black Forest Labs generation failed: Error.',
        });
        expect(server.calls).toHaveLength(2);
      },
    );

    it('keeps HTTP 503 without a terminal task status retryable', async () => {
      server.urls['https://api.example.com/poll'].response = {
        type: 'error',
        status: 503,
        body: JSON.stringify({ detail: 'Service unavailable' }),
      };
      await expect(
        createBasicModel({ modelId: 'flux-3-image' }).doGenerate(callOptions),
      ).rejects.toMatchObject({
        statusCode: 503,
        isRetryable: true,
        message: 'Service unavailable',
      });
    });
  });

  describe('constructor', () => {
    it('exposes correct provider and model information', () => {
      const model = createBasicModel();

      expect(model.provider).toBe('black-forest-labs.image');
      expect(model.modelId).toBe('test-model');
      expect(model.specificationVersion).toBe('v4');
      expect(model.maxImagesPerCall).toBe(1);
    });
  });
});
