import type { FetchFunction } from '@ai-sdk/provider-utils';
import { describe, expect, it } from 'vitest';
import { createBlackForestLabs } from './black-forest-labs-provider';

describe('BlackForestLabs provider', () => {
  it('creates image models via .image and .imageModel', () => {
    const provider = createBlackForestLabs();

    const imageModel = provider.image('flux-pro-1.1');
    const imageModel2 = provider.imageModel('flux-pro-1.1-ultra');

    expect(imageModel.provider).toBe('black-forest-labs.image');
    expect(imageModel.modelId).toBe('flux-pro-1.1');
    expect(imageModel2.modelId).toBe('flux-pro-1.1-ultra');
    expect(imageModel.specificationVersion).toBe('v2');
  });

  it('configures baseURL and headers correctly', async () => {
    const calls: Array<{
      url: string;
      method: string;
      headers: Record<string, string>;
      bodyJson?: unknown;
    }> = [];

    const fetchMock: FetchFunction = async (input, init) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;
      const method =
        init?.method ??
        (typeof input === 'string' || input instanceof URL
          ? 'GET'
          : input.method);
      const headers = new Headers(init?.headers);

      let bodyJson: unknown;
      if (typeof init?.body === 'string') {
        bodyJson = JSON.parse(init.body);
      }

      calls.push({
        url,
        method,
        headers: Object.fromEntries(headers.entries()),
        bodyJson,
      });

      if (url === 'https://api.example.com/v1/flux-pro-1.1') {
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

      if (url.startsWith('https://api.example.com/poll')) {
        return new Response(
          JSON.stringify({
            status: 'Ready',
            result: {
              sample: 'https://api.example.com/image.png',
            },
          }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' },
          },
        );
      }

      if (url === 'https://api.example.com/image.png') {
        return new Response(new Uint8Array([1, 2, 3]), {
          status: 200,
          headers: { 'content-type': 'image/png' },
        });
      }

      throw new Error(`Unexpected URL: ${url}`);
    };

    const provider = createBlackForestLabs({
      apiKey: 'test-api-key',
      baseURL: 'https://api.example.com/v1',
      headers: {
        'x-extra-header': 'extra',
      },
      fetch: fetchMock,
    });

    const model = provider.image('flux-pro-1.1');

    await model.doGenerate({
      prompt: 'A serene mountain landscape at sunset',
      n: 1,
      size: undefined,
      seed: undefined,
      aspectRatio: '1:1',
      providerOptions: {},
    });

    expect(calls[0]).toMatchObject({
      url: 'https://api.example.com/v1/flux-pro-1.1',
      method: 'POST',
    });
    expect(calls[0].headers['x-key']).toBe('test-api-key');
    expect(calls[0].headers['x-extra-header']).toBe('extra');
    expect(calls[0].bodyJson).toMatchObject({
      prompt: 'A serene mountain landscape at sunset',
      aspect_ratio: '1:1',
    });

    expect(calls[0].headers['user-agent']).toContain(
      'ai-sdk/black-forest-labs/',
    );
    expect(calls[1].headers['user-agent']).toContain(
      'ai-sdk/black-forest-labs/',
    );
    expect(calls[2].headers['user-agent']).toContain(
      'ai-sdk/black-forest-labs/',
    );
  });

  it('throws NoSuchModelError for unsupported model types', () => {
    const provider = createBlackForestLabs();

    expect(() => provider.languageModel('some-id')).toThrowError(
      'No such languageModel',
    );
    expect(() => provider.textEmbeddingModel('some-id')).toThrowError(
      'No such textEmbeddingModel',
    );
  });
});
