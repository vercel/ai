import { JsonTestServer } from '@ai-sdk/provider-utils/test';
import { createVenice } from './venice-provider';

const prompt = 'A cute baby sea otter';

const provider = createVenice({ apiKey: 'test-api-key' });
const model = provider.imageModel('fluently-xl', { maxImagesPerCall: 1 });

describe('doGenerate', () => {
  const server = new JsonTestServer(
    'https://api.venice.ai/api/v1/image/generate',
  );

  server.setupTestEnvironment();

  function prepareJsonResponse() {
    server.responseBodyJson = {
      created: 1733837122,
      data: [
        {
          b64_json: 'base64-image-1',
        },
      ],
    };
  }

  it('should pass the model and the settings', async () => {
    prepareJsonResponse();

    await model.doGenerate({
      prompt,
      n: 1,
      size: '1024x1024',
      aspectRatio: undefined,
      seed: 12345,
      providerOptions: { 
        venice: { 
          style_preset: 'photographic',
          safe_mode: true,
          num_inference_steps: 30,
          guidance_scale: 7.5
        } 
      },
    });

    expect(await server.getRequestBodyJson()).toStrictEqual({
      model: 'fluently-xl',
      prompt,
      n: 1,
      size: '1024x1024',
      style_preset: 'photographic',
      safe_mode: true,
      num_inference_steps: 30,
      guidance_scale: 7.5,
      seed: 12345,
      response_format: 'b64_json',
    });
  });

  it('should pass headers', async () => {
    prepareJsonResponse();

    const provider = createVenice({
      apiKey: 'test-api-key',
      headers: {
        'Custom-Provider-Header': 'provider-header-value',
      },
    });

    await provider.imageModel('fluently-xl').doGenerate({
      prompt,
      n: 1,
      size: '1024x1024',
      aspectRatio: undefined,
      seed: undefined,
      providerOptions: { 
        venice: { 
          style_preset: 'photographic' 
        } 
      },
      headers: {
        'Custom-Request-Header': 'request-header-value',
      },
    });

    const requestHeaders = await server.getRequestHeaders();

    expect(requestHeaders).toStrictEqual({
      authorization: 'Bearer test-api-key',
      'content-type': 'application/json',
      'custom-provider-header': 'provider-header-value',
      'custom-request-header': 'request-header-value',
    });
  });

  it('should extract the generated images', async () => {
    prepareJsonResponse();

    const result = await model.doGenerate({
      prompt,
      n: 1,
      size: undefined,
      aspectRatio: undefined,
      seed: undefined,
      providerOptions: {},
    });

    expect(result.images).toStrictEqual(['base64-image-1']);
  });

  it('should return warning only for unsupported aspect ratio', async () => {
    prepareJsonResponse();

    const result = await model.doGenerate({
      prompt,
      n: 1,
      size: '1024x1024',
      aspectRatio: '1:1',
      seed: 12345,
      providerOptions: {},
    });

    expect(result.warnings).toStrictEqual([
      {
        type: 'unsupported-setting',
        setting: 'aspectRatio',
        details:
          'This model does not support aspect ratio. Use `size` instead.',
      },
    ]);
  });

  it('should respect maxImagesPerCall setting', async () => {
    prepareJsonResponse();

    const customModel = provider.imageModel('fluently-xl', { maxImagesPerCall: 2 });
    expect(customModel.maxImagesPerCall).toBe(2);

    const defaultModel = provider.imageModel('fluently-xl');
    expect(defaultModel.maxImagesPerCall).toBe(1); // fluently-xl's default from settings

    const unknownModel = provider.imageModel('unknown-model' as any);
    expect(unknownModel.maxImagesPerCall).toBe(1); // fallback for unknown models
  });
});
