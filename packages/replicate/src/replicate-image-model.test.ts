import { createTestServer } from '@ai-sdk/provider-utils/test';
import { createReplicate } from './replicate-provider';
import { ReplicateImageModel } from './replicate-image-model';

const prompt = 'The Loch Ness monster getting a manicure';

const provider = createReplicate({ apiToken: 'test-api-token' });
const model = provider.image('black-forest-labs/flux-schnell');

describe('doGenerate', () => {
  const testDate = new Date(2024, 0, 1);
  const server = createTestServer({
    'https://api.replicate.com/*': {},
    'https://replicate.delivery/*': {
      response: {
        type: 'binary',
        body: Buffer.from('test-binary-content'),
      },
    },
  });

  function prepareResponse({
    output = ['https://replicate.delivery/xezq/abc/out-0.webp'],
  }: { output?: string | Array<string> } = {}) {
    server.urls['https://api.replicate.com/*'].response = {
      type: 'json-value',
      body: {
        id: 's7x1e3dcmhrmc0cm8rbatcneec',
        model: 'black-forest-labs/flux-schnell',
        version: 'dp-4d0bcc010b3049749a251855f12800be',
        input: {
          num_outputs: 1,
          prompt: 'The Loch Ness Monster getting a manicure',
        },
        logs: '',
        output,
        data_removed: false,
        error: null,
        status: 'processing',
        created_at: '2025-01-08T13:24:38.692Z',
        urls: {
          cancel:
            'https://api.replicate.com/v1/predictions/s7x1e3dcmhrmc0cm8rbatcneec/cancel',
          get: 'https://api.replicate.com/v1/predictions/s7x1e3dcmhrmc0cm8rbatcneec',
          stream:
            'https://stream.replicate.com/v1/files/bcwr-3okdfv3o2wehstv5f2okyftwxy57hhypqsi6osiim5iaq5k7u24a',
        },
      },
    };
  }

  it('should pass the model and the settings', async () => {
    prepareResponse();

    await model.doGenerate({
      prompt,
      n: 1,
      size: '1024x768',
      aspectRatio: '3:4',
      seed: 123,
      providerOptions: {
        replicate: {
          style: 'realistic_image',
        },
        other: {
          something: 'else',
        },
      },
    });

    expect(await server.calls[0].requestBodyJson).toStrictEqual({
      input: {
        prompt,
        num_outputs: 1,
        aspect_ratio: '3:4',
        size: '1024x768',
        seed: 123,
        style: 'realistic_image',
      },
    });
  });

  it('should call the correct url', async () => {
    prepareResponse();

    await model.doGenerate({
      prompt,
      n: 1,
      size: undefined,
      aspectRatio: undefined,
      seed: undefined,
      providerOptions: {},
    });

    expect(server.calls[0].requestMethod).toStrictEqual('POST');
    expect(server.calls[0].requestUrl).toStrictEqual(
      'https://api.replicate.com/v1/models/black-forest-labs/flux-schnell/predictions',
    );
  });

  it('should pass headers and set the prefer header', async () => {
    prepareResponse();

    const provider = createReplicate({
      apiToken: 'test-api-token',
      headers: {
        'Custom-Provider-Header': 'provider-header-value',
      },
    });

    await provider.image('black-forest-labs/flux-schnell').doGenerate({
      prompt,
      n: 1,
      size: undefined,
      aspectRatio: undefined,
      seed: undefined,
      providerOptions: {},
      headers: {
        'Custom-Request-Header': 'request-header-value',
      },
    });

    expect(server.calls[0].requestHeaders).toStrictEqual({
      authorization: 'Bearer test-api-token',
      'content-type': 'application/json',
      'custom-provider-header': 'provider-header-value',
      'custom-request-header': 'request-header-value',
      prefer: 'wait',
    });
  });

  it('should extract the generated image from array response', async () => {
    prepareResponse({
      output: ['https://replicate.delivery/xezq/abc/out-0.webp'],
    });

    const result = await model.doGenerate({
      prompt,
      n: 1,
      size: undefined,
      aspectRatio: undefined,
      seed: undefined,
      providerOptions: {},
    });

    expect(result.images).toStrictEqual([
      new Uint8Array(Buffer.from('test-binary-content')),
    ]);

    expect(server.calls[1].requestMethod).toStrictEqual('GET');
    expect(server.calls[1].requestUrl).toStrictEqual(
      'https://replicate.delivery/xezq/abc/out-0.webp',
    );
  });

  it('should extract the generated image from string response', async () => {
    prepareResponse({
      output: 'https://replicate.delivery/xezq/abc/out-0.webp',
    });

    const result = await model.doGenerate({
      prompt,
      n: 1,
      size: undefined,
      aspectRatio: undefined,
      seed: undefined,
      providerOptions: {},
    });

    expect(result.images).toStrictEqual([
      new Uint8Array(Buffer.from('test-binary-content')),
    ]);

    expect(server.calls[1].requestMethod).toStrictEqual('GET');
    expect(server.calls[1].requestUrl).toStrictEqual(
      'https://replicate.delivery/xezq/abc/out-0.webp',
    );
  });

  it('should return response metadata', async () => {
    const modelWithTimestamp = new ReplicateImageModel(
      'black-forest-labs/flux-schnell',
      {
        provider: 'replicate',
        baseURL: 'https://api.replicate.com',
        _internal: { currentDate: () => testDate },
      },
    );
    prepareResponse({
      output: ['https://replicate.delivery/xezq/abc/out-0.webp'],
    });

    const result = await modelWithTimestamp.doGenerate({
      prompt,
      n: 1,
      size: undefined,
      aspectRatio: undefined,
      seed: undefined,
      providerOptions: {},
    });

    expect(result.response).toStrictEqual({
      timestamp: testDate,
      modelId: 'black-forest-labs/flux-schnell',
      headers: expect.any(Object),
    });
  });

  it('should include response headers in metadata', async () => {
    const modelWithTimestamp = new ReplicateImageModel(
      'black-forest-labs/flux-schnell',
      {
        provider: 'replicate',
        baseURL: 'https://api.replicate.com',
        _internal: {
          currentDate: () => testDate,
        },
      },
    );
    server.urls['https://api.replicate.com/*'].response = {
      type: 'json-value',
      headers: {
        'custom-response-header': 'response-header-value',
      },
      body: {
        id: 's7x1e3dcmhrmc0cm8rbatcneec',
        model: 'black-forest-labs/flux-schnell',
        version: 'dp-4d0bcc010b3049749a251855f12800be',
        input: {
          num_outputs: 1,
          prompt: 'The Loch Ness Monster getting a manicure',
        },
        logs: '',
        output: ['https://replicate.delivery/xezq/abc/out-0.webp'],
        data_removed: false,
        error: null,
        status: 'processing',
        created_at: '2025-01-08T13:24:38.692Z',
        urls: {
          cancel:
            'https://api.replicate.com/v1/predictions/s7x1e3dcmhrmc0cm8rbatcneec/cancel',
          get: 'https://api.replicate.com/v1/predictions/s7x1e3dcmhrmc0cm8rbatcneec',
          stream:
            'https://stream.replicate.com/v1/files/bcwr-3okdfv3o2wehstv5f2okyftwxy57hhypqsi6osiim5iaq5k7u24a',
        },
      },
    };

    const result = await modelWithTimestamp.doGenerate({
      prompt,
      n: 1,
      size: undefined,
      aspectRatio: undefined,
      seed: undefined,
      providerOptions: {},
    });

    expect(result.response).toStrictEqual({
      timestamp: testDate,
      modelId: 'black-forest-labs/flux-schnell',
      headers: {
        'content-length': '646',
        'content-type': 'application/json',
        'custom-response-header': 'response-header-value',
      },
    });
  });

  it('should set version in request body for versioned models', async () => {
    prepareResponse();

    const versionedModel = provider.image(
      'bytedance/sdxl-lightning-4step:5599ed30703defd1d160a25a63321b4dec97101d98b4674bcc56e41f62f35637',
    );

    await versionedModel.doGenerate({
      prompt,
      n: 1,
      size: undefined,
      aspectRatio: undefined,
      seed: undefined,
      providerOptions: {},
    });

    expect(server.calls[0].requestMethod).toStrictEqual('POST');
    expect(server.calls[0].requestUrl).toStrictEqual(
      'https://api.replicate.com/v1/predictions',
    );
    expect(await server.calls[0].requestBodyJson).toStrictEqual({
      input: {
        prompt,
        num_outputs: 1,
      },
      version:
        '5599ed30703defd1d160a25a63321b4dec97101d98b4674bcc56e41f62f35637',
    });
  });
});
