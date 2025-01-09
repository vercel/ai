import { createTestServer } from '@ai-sdk/provider-utils/test';
import { createReplicate } from './replicate-provider';

const prompt = 'The Loch Ness monster getting a manicure';

const provider = createReplicate({ apiToken: 'test-api-token' });
const model = provider.image('black-forest-labs/flux-schnell');

describe('doGenerate', () => {
  const server = createTestServer({
    'https://api.replicate.com/*': {
      type: 'json-value',
    },
    'https://replicate.delivery/*': {
      type: 'binary',
      response: {
        body: Buffer.from('test-binary-content'),
      },
    },
  });

  function prepareResponse({
    output = ['https://replicate.delivery/xezq/abc/out-0.webp'],
  }: { output?: string | Array<string> } = {}) {
    server.urls['https://api.replicate.com/*'].response = {
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
      size: undefined,
      aspectRatio: undefined,
      seed: undefined,
      providerOptions: {},
    });

    expect(await server.calls[0].requestBody).toStrictEqual({
      input: {
        prompt,
        num_outputs: 1,
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

  // TODO multi-image test

  it.skip('should return warnings for unsupported settings', async () => {
    prepareResponse();

    const result = await model.doGenerate({
      prompt,
      n: 1,
      size: '1024x1024',
      aspectRatio: '1:1',
      seed: 123,
      providerOptions: {},
    });

    expect(result.warnings).toStrictEqual([
      {
        type: 'unsupported-setting',
        setting: 'aspectRatio',
        details:
          'This model does not support aspect ratio. Use `size` instead.',
      },
      {
        type: 'unsupported-setting',
        setting: 'seed',
      },
    ]);
  });
});
