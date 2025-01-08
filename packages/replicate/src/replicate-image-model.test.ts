import { BinaryTestServer, JsonTestServer } from '@ai-sdk/provider-utils/test';
import { createReplicate } from './replicate-provider';

const prompt = 'The Loch Ness monster getting a manicure';

const provider = createReplicate({ apiToken: 'test-api-token' });
const model = provider.image('black-forest-labs/flux-schnell');

describe('doGenerate', () => {
  const server = new JsonTestServer(
    'https://api.replicate.com/v1/models/black-forest-labs/flux-schnell/predictions',
  );

  const imageServer1 = new BinaryTestServer(
    'https://replicate.delivery/xezq/abc/out-0.webp',
  );

  server.setupTestEnvironment();
  imageServer1.setupTestEnvironment();

  function prepareJsonResponse() {
    server.responseBodyJson = {
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
    };
  }

  it('should pass the model and the settings', async () => {
    prepareJsonResponse();

    await model.doGenerate({
      prompt,
      n: 1,
      size: undefined,
      aspectRatio: undefined,
      seed: undefined,
      providerOptions: {},
    });

    expect(await server.getRequestBodyJson()).toStrictEqual({
      input: {
        prompt,
        num_outputs: 1,
      },
    });
  });

  it('should pass headers and set the prefer header', async () => {
    prepareJsonResponse();

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

    const requestHeaders = await server.getRequestHeaders();

    expect(requestHeaders).toStrictEqual({
      authorization: 'Bearer test-api-token',
      'content-type': 'application/json',
      'custom-provider-header': 'provider-header-value',
      'custom-request-header': 'request-header-value',
      prefer: 'wait',
    });
  });

  it.skip('should extract the generated images', async () => {
    prepareJsonResponse();

    const result = await model.doGenerate({
      prompt,
      n: 1,
      size: undefined,
      aspectRatio: undefined,
      seed: undefined,
      providerOptions: {},
    });

    expect(result.images).toStrictEqual(['base64-image-1', 'base64-image-2']);
  });

  it.skip('should return warnings for unsupported settings', async () => {
    prepareJsonResponse();

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
